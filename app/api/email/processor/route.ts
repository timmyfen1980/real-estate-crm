/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildEmailTemplate, buildNewsletterEmail } from '@/lib/emailTemplates'
import {
  torontoYearMonth,
  issueKeyFor,
  stepForMonth,
  torontoMonthWindow,
  isIssueApproved,
} from '@/lib/newsletterIssue'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

const NEWSLETTER_CAMPAIGN_ID =
  'bb0b2174-639b-43fc-9f03-2bb289210de2'

const MAX_EMAILS_PER_DAY = 96

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // =====================================
    // DAILY SEND CAP
    // =====================================

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const { count: sentToday } = await supabase
      .from('email_logs')
      .select('*', {
        count: 'exact',
        head: true,
      })
      .eq('status', 'sent')
      .gte('sent_at', startOfDay.toISOString())

    const remainingQuota =
      MAX_EMAILS_PER_DAY - (sentToday || 0)

    if (remainingQuota <= 0) {
      return NextResponse.json({
        success: true,
        message: 'Daily email cap reached',
      })
    }

    // =====================================
    // NEWSLETTER - MONTHLY ISSUE MODEL
    // Only the current month's step may send, only when that issue
    // (YYYY-MM) is approved, and only to active enrollments that have
    // not already received it this month (email_logs check). The
    // newsletter's current_step / next_send_at are never used or
    // advanced here.
    // =====================================

    let newsletterSent = 0

    {
      const now = new Date()
      const { year, month } = torontoYearMonth(now)
      const issueKey = issueKeyFor(year, month)
      const issueStep = stepForMonth(month)
      const approved = await isIssueApproved(supabase, issueKey)

      if (!approved) {
        console.log(
          `Newsletter issue ${issueKey} is not approved - skipping`
        )
      } else {
        const { data: issueSequence } = await supabase
          .from('email_sequences')
          .select('*')
          .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
          .eq('step_number', issueStep)
          .single()

        if (!issueSequence) {
          console.log(
            `Newsletter: no sequence found for step ${issueStep}`
          )
        } else {
          // Contacts who already received this issue this month
          const window = torontoMonthWindow(now)
          const { data: sentLogs } = await supabase
            .from('email_logs')
            .select('contact_id')
            .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
            .eq('sequence_id', issueSequence.id)
            .eq('status', 'sent')
            .gte('sent_at', window.startIso)
            .lt('sent_at', window.endIso)
            .limit(10000)

          const received = new Set(
            (sentLogs || []).map((l: any) => l.contact_id)
          )

          // Active enrollments, oldest first (stable order)
          let enrollments: any[] = []
          const ordered = await supabase
            .from('contact_campaigns')
            .select('id, contact_id, created_at')
            .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
            .eq('status', 'active')
            .order('created_at', { ascending: true })
            .limit(10000)
          if (ordered.error) {
            const fallback = await supabase
              .from('contact_campaigns')
              .select('id, contact_id')
              .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
              .eq('status', 'active')
              .limit(10000)
            enrollments = fallback.data || []
          } else {
            enrollments = ordered.data || []
          }

          // Newsletter artwork (CID attachments, same as before)
          const heroB64 = readFileSync(
            join(process.cwd(), 'public', 'email-hero.b64'),
            'utf8'
          ).trim()
          const teamPhotoB64 = readFileSync(
            join(process.cwd(), 'public', 'team-photo.b64'),
            'utf8'
          ).trim()
          const nlAttachments = [
            {
              filename: 'hero.png',
              content: heroB64,
              contentType: 'image/png',
              contentId: 'newsletter-hero',
            },
            {
              filename: 'team-photo.jpg',
              content: teamPhotoB64,
              contentType: 'image/jpeg',
              contentId: 'team-photo',
            },
          ]

          for (const enr of enrollments) {
            if (newsletterSent >= remainingQuota) break
            if (received.has(enr.contact_id)) continue

            const { data: contact } = await supabase
              .from('contacts')
              .select(
                'email, first_name, assigned_user_id, account_id'
              )
              .eq('id', enr.contact_id)
              .single()

            if (!contact || !contact.email) continue

            // Consent flags (newsletter path): never send to
            // do-not-contact or opted-out contacts.
            const { data: flags } = await supabase
              .from('contacts')
              .select('do_not_contact, email_opt_in')
              .eq('id', enr.contact_id)
              .single()

            if (flags?.do_not_contact || flags?.email_opt_in === false) {
              console.log(
                `Newsletter: skipping ${contact.email} (do not contact / opted out)`
              )
              continue
            }

            const { data: sub } = await supabase
              .from('contact_subscriptions')
              .select('unsubscribed')
              .eq('contact_id', enr.contact_id)
              .single()

            if (sub?.unsubscribed) continue

            const { data: account } = await supabase
              .from('accounts')
              .select(
                'team_logo_url, brokerage_logo_url, brokerage_name, team_name'
              )
              .eq('id', contact.account_id)
              .single()

            const siteOrigin = new URL(req.url).origin
            const unsubscribeLink = `${siteOrigin}/api/unsubscribe?contact_id=${enr.contact_id}`

            const rawContent = issueSequence.body_html.replace(
              '{{first_name}}',
              contact.first_name || ''
            )

            const body = buildNewsletterEmail({
              content: rawContent,
              firstName: contact.first_name,
              headline: issueSequence.subject,
              teamName: 'Fennessey Comeau Group',
              teamEmail: 'info@thefcgroup.ca',
              teamPhone: '905 493-7355',
              brokerageName:
                'RE/MAX HALLMARK FIRST GROUP REALTY LTD.',
              brokerageLogoUrl: account?.brokerage_logo_url,
              unsubscribeLink,
              ctaLink: issueSequence.cta_link || null,
              ctaText: issueSequence.cta_text || null,
            })

            const { data: sender } = await supabase
              .from('email_addresses')
              .select('*')
              .eq('account_id', contact.account_id)
              .eq('is_default', true)
              .single()

            const fromEmail = sender
              ? `${sender.name} <${sender.email}>`
              : 'The FC Group <info@thefcgroup.ca>'

            console.log(
              `Sending newsletter "${issueSequence.subject}" to ${contact.email}`
            )
            const send = await resend.emails.send({
              from: fromEmail,
              to: contact.email,
              subject: issueSequence.subject,
              html: body,
              attachments: nlAttachments,
            })

            await supabase.from('email_logs').insert({
              account_id: contact.account_id,
              contact_id: enr.contact_id,
              campaign_id: NEWSLETTER_CAMPAIGN_ID,
              sequence_id: issueSequence.id,
              subject: issueSequence.subject,
              body_html: body,
              sent_at: new Date().toISOString(),
              status: send?.error ? 'failed' : 'sent',
              resend_id: send?.data?.id,
            })

            received.add(enr.contact_id)
            newsletterSent++
          }

          console.log(
            `Newsletter issue ${issueKey}: sent ${newsletterSent}`
          )
        }
      }
    }

    // =====================================
    // FETCH DUE CAMPAIGNS
    // (Newsletter excluded - handled by the Monthly Issue model above)
    // =====================================

    const { data: campaigns, error } = await supabase
      .from('contact_campaigns')
      .select(`
        id,
        contact_id,
        campaign_id,
        current_step,
        next_send_at
      `)
      .eq('status', 'active')
      .neq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
      .lte('next_send_at', new Date().toISOString())
      .order('next_send_at', { ascending: true })

    if (error) throw error
    console.log(`Found ${(campaigns || []).length} due campaigns`)

    for (
      const [index, c] of (campaigns || []).entries()
    ) {
      console.log(
  `Campaign: ${c.campaign_id} | Contact: ${c.contact_id} | Step: ${c.current_step}`
)
      // =====================================
      // STOP AT DAILY CAP
      // =====================================

      if (index >= remainingQuota - newsletterSent) {
        break
      }

      const {
  data: sequence,
  error: sequenceError,
} = await supabase
  .from('email_sequences')
  .select('*')
  .eq('campaign_id', c.campaign_id)
  .eq('step_number', c.current_step)
  .single()

if (sequenceError) {
  throw new Error(
    `SEQUENCE LOOKUP FAILED: ${sequenceError.message} | Campaign: ${c.campaign_id} | Step: ${c.current_step}`
  )
}

if (!sequence) {
  throw new Error(
    `SEQUENCE IS NULL | Campaign: ${c.campaign_id} | Step: ${c.current_step}`
  )
}

console.log(`Sequence found: ${sequence.subject}`)

      const {
  data: contact,
  error: contactError,
} = await supabase
  .from('contacts')
  .select(
    'email, first_name, assigned_user_id, account_id'
  )
  .eq('id', c.contact_id)
  .single()

if (contactError) {
  throw new Error(
    `CONTACT LOOKUP FAILED: ${contactError.message} | Contact ID: ${c.contact_id}`
  )
}

if (!contact) {
  throw new Error(
    `CONTACT IS NULL | Contact ID: ${c.contact_id}`
  )
}

if (!contact.email) {
  console.log(
    `Skipping contact with no email: ${c.contact_id}`
  )
  continue
}

console.log(`Contact email: ${contact.email}`)

      // =====================================
      // UNSUBSCRIBE CHECK
      // =====================================

      const { data: sub } = await supabase
        .from('contact_subscriptions')
        .select('unsubscribed')
        .eq('contact_id', c.contact_id)
        .single()

      if (sub?.unsubscribed) {
  console.log(`${contact.email} is unsubscribed`)
  continue
}

      // =====================================
      // AGENT
      // =====================================

      const { data: agent } = await supabase
        .from('profiles')
        .select(
          'full_name, email, phone, agent_photo_url'
        )
        .eq('id', contact.assigned_user_id)
        .single()

      // =====================================
      // ACCOUNT
      // =====================================

      const { data: account } = await supabase
        .from('accounts')
        .select(
          'team_logo_url, brokerage_logo_url, brokerage_name, team_name'
        )
        .eq('id', contact.account_id)
        .single()

      // =====================================
      // CTA
      // =====================================

      const ctaLink = sequence.cta_link || null
      const ctaText = sequence.cta_text || null

      // =====================================
      // UNSUBSCRIBE LINK
      // =====================================

      const siteOrigin = new URL(req.url).origin
      const unsubscribeLink = `${siteOrigin}/api/unsubscribe?contact_id=${c.contact_id}`

      // =====================================
      // CONTENT
      // =====================================

      const rawContent = sequence.body_html.replace(
        '{{first_name}}',
        contact.first_name || ''
      )

      const isNewsletter = c.campaign_id === NEWSLETTER_CAMPAIGN_ID
      let body: string
      let attachments: any[] = []
      if (isNewsletter) {
        // Team-branded newsletter: hero + team photo embedded via CID so they
        // always render (no dependency on NEXT_PUBLIC_SITE_URL).
        const heroB64 = readFileSync(join(process.cwd(), 'public', 'email-hero.b64'), 'utf8').trim()
        const teamPhotoB64 = readFileSync(join(process.cwd(), 'public', 'team-photo.b64'), 'utf8').trim()
        attachments = [
          { filename: 'hero.png', content: heroB64, contentType: 'image/png', contentId: 'newsletter-hero' },
          { filename: 'team-photo.jpg', content: teamPhotoB64, contentType: 'image/jpeg', contentId: 'team-photo' },
        ]
        body = buildNewsletterEmail({
          content: rawContent,
          firstName: contact.first_name,
          headline: sequence.subject,
          teamName: 'Fennessey Comeau Group',
          teamEmail: 'info@thefcgroup.ca',
          teamPhone: '905 493-7355',
          brokerageName: 'RE/MAX HALLMARK FIRST GROUP REALTY LTD.',
          brokerageLogoUrl: account?.brokerage_logo_url,
          unsubscribeLink,
          ctaLink,
          ctaText,
        })
      } else {
        body = buildEmailTemplate({
          content: rawContent,
          firstName: contact.first_name,
          agentName: agent?.full_name,
          agentEmail: agent?.email,
          agentPhone: agent?.phone,
          agentPhoto: agent?.agent_photo_url,
          teamLogo: account?.team_logo_url,
          brokerageLogo: account?.brokerage_logo_url,
          brokerageName: account?.brokerage_name,
          unsubscribeLink,
          ctaLink,
          ctaText,
          emailHeaderImage: `${siteOrigin}/api/email-hero`,
        })
      }
console.log('Email template built successfully')
      const accountId = contact.account_id

      // =====================================
      // FROM EMAIL
      // =====================================

      const { data: sender } = await supabase
        .from('email_addresses')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_default', true)
        .single()

      const fromEmail = sender
        ? `${sender.name} <${sender.email}>`
        : 'The FC Group <info@thefcgroup.ca>'

      // =====================================
      // SEND EMAIL
      // =====================================
      console.log(
  `Sending "${sequence.subject}" to ${contact.email}`
)
      const send = await resend.emails.send({
        from: fromEmail,
        to: contact.email,
        subject: sequence.subject,
        html: body,
        ...(attachments.length ? { attachments } : {}),
      })
console.log('Resend response:', send)
      // =====================================
      // LOG EMAIL
      // =====================================

      await supabase.from('email_logs').insert({
        account_id: accountId,
        contact_id: c.contact_id,
        campaign_id: c.campaign_id,
        sequence_id: sequence.id,
        subject: sequence.subject,
        body_html: body,
        sent_at: new Date().toISOString(),
        status: send?.error ? 'failed' : 'sent',
        resend_id: send?.data?.id,
      })

      const nextStep = c.current_step + 1

      const { data: nextSequence } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('campaign_id', c.campaign_id)
        .eq('step_number', nextStep)
        .single()

      // =====================================
      // COMPLETE CAMPAIGN
      // =====================================

      if (!nextSequence) {
        await supabase
          .from('contact_campaigns')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', c.id)
      } else {
        let nextDate = new Date()

       // =====================================
// MONTHLY NEWSLETTER LOGIC
// =====================================

if (
  c.campaign_id ===
  NEWSLETTER_CAMPAIGN_ID
) {
  // Look up this contact's newsletter batch
  const { data: campaignRow } = await supabase
    .from('contact_campaigns')
    .select('newsletter_batch')
    .eq('id', c.id)
    .single()

  const batch = campaignRow?.newsletter_batch || 1

  nextDate = new Date()

  // Send on the same day every month as the batch number
  nextDate.setMonth(nextDate.getMonth() + 1)
  nextDate.setDate(batch)
  nextDate.setHours(9, 0, 0, 0)
} else {
          // =====================================
          // NORMAL DRIP CAMPAIGNS
          // =====================================

          nextDate = new Date()

          nextDate.setDate(
            nextDate.getDate() +
              nextSequence.delay_days
          )
        }

        await supabase
          .from('contact_campaigns')
          .update({
            current_step: nextStep,
            next_send_at: nextDate.toISOString(),
          })
          .eq('id', c.id)
      }
    }

    return NextResponse.json({
  success: true,
  campaignsFound: campaigns?.length ?? 0,
})
  }catch (err: any) {
  console.error('EMAIL PROCESSOR FAILED')
  console.error(err)

  return NextResponse.json(
    {
      error: err.message,
    },
    { status: 500 }
  )
}
}
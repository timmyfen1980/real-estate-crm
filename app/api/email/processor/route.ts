import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildEmailTemplate } from '@/lib/emailTemplates'

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
    // FETCH DUE CAMPAIGNS
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

      if (index >= remainingQuota) {
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
          'team_logo_url, brokerage_logo_url, brokerage_name'
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

      const unsubscribeLink = `${process.env.NEXT_PUBLIC_SITE_URL}/api/unsubscribe?contact_id=${c.contact_id}`

      // =====================================
      // CONTENT
      // =====================================

      const rawContent = sequence.body_html.replace(
        '{{first_name}}',
        contact.first_name || ''
      )

      const body = buildEmailTemplate({
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
      })
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
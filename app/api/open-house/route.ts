import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { Resend } from 'resend'
// Simple in-memory rate limit store
const rateLimitMap = new Map<string, { count: number; timestamp: number }>()

function isRateLimited(ip: string) {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute window
  const maxRequests = 5 // 5 submissions per minute per IP

  const record = rateLimitMap.get(ip)

  if (!record) {
    rateLimitMap.set(ip, { count: 1, timestamp: now })
    return false
  }

  if (now - record.timestamp > windowMs) {
    rateLimitMap.set(ip, { count: 1, timestamp: now })
    return false
  }

  if (record.count >= maxRequests) {
    return true
  }

  record.count++
  return false
}

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    // Extract IP address
const ip =
  req.headers.get('x-forwarded-for') ||
  req.headers.get('x-real-ip') ||
  'unknown'

if (isRateLimited(ip)) {
  return NextResponse.json(
    { error: 'Too many submissions. Please try again later.' },
    { status: 429 }
  )
}

    const {
      first_name,
      last_name,
      email,
      phone,
      property_id,
      open_house_event_id,
      hear_about,
      hear_about_other,
      working_with_realtor,
      realtor_name,
      buyer_stage,
      wants_feature_sheet,
    } = body

    if (!first_name || !email || !property_id || !open_house_event_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    const { data: property } = await supabaseAdmin
      .from('properties')
      .select('account_id, feature_sheet_url, address')
      .eq('id', property_id)
      .single()

    if (!property) {
      return NextResponse.json(
        { error: 'Invalid property' },
        { status: 400 }
      )
    }

    // 🔒 Fetch account owner for assignment + review tasks
    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('owner_user_id, owner_email')
      .eq('id', property.account_id)
      .single()

    if (!account?.owner_user_id) {
      return NextResponse.json(
        { error: 'Account owner not found' },
        { status: 500 }
      )
    }

    const { data: event } = await supabaseAdmin
      .from('open_house_events')
      .select('id, user_id')
      .eq('id', open_house_event_id)
      .eq('property_id', property_id)
      .single()

    if (!event) {
      return NextResponse.json(
        { error: 'Invalid open house event' },
        { status: 400 }
      )
    }

    const { data: existingLead } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('account_id', property.account_id)
      .maybeSingle()

    let leadId: string

    if (existingLead) {
      leadId = existingLead.id

      // 🔎 Fetch current lead assignment
      const { data: currentLead } = await supabaseAdmin
        .from('leads')
        .select('assigned_user_id')
        .eq('id', leadId)
        .single()

      const currentAssigned = currentLead?.assigned_user_id

      // If different agent hosted this open house
      if (currentAssigned && currentAssigned !== event.user_id) {
        await supabaseAdmin.from('notes').insert([
          {
            lead_id: leadId,
            user_id: event.user_id,
            content:
              'Lead attended open house hosted by another team member.',
          },
        ])

        const { data: existingReviewTask } = await supabaseAdmin
          .from('tasks')
          .select('id')
          .eq('lead_id', leadId)
          .eq('source', 'multi_agent_review')
          .maybeSingle()

        if (!existingReviewTask) {
          await supabaseAdmin.from('tasks').insert([
            {
              account_id: property.account_id,
              assigned_user_id: account.owner_user_id,
              created_by: event.user_id,
              lead_id: leadId,
              title:
                'Review lead ownership — multi-agent interaction',
              description:
                'This lead attended an open house hosted by another team member. Review ownership.',
              due_date: new Date().toISOString().split('T')[0],
              priority: 'medium',
              status: 'pending',
              source: 'multi_agent_review',
              auto_generated: true,
            },
          ])
        }
      }
        } else {

      // =====================================
      // ENSURE CONTACT EXISTS (IDENTITY LOCK)
      // =====================================

      let contactId: string

      const { data: existingContact } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('account_id', property.account_id)
        .eq('email', normalizedEmail)
        .maybeSingle()

      if (existingContact) {
        contactId = existingContact.id
      } else {
        const { data: newContact, error: contactError } =
          await supabaseAdmin
            .from('contacts')
            .insert([
              {
                account_id: property.account_id,
                created_by: event.user_id,
                assigned_user_id: event.user_id,
                first_name,
                last_name,
                email: normalizedEmail,
                phone,
                lifecycle_stage: 'New',
                source: 'Open House',
                original_source: 'Open House',
              },
            ])
            .select('id')
            .single()

        if (contactError || !newContact) {
          return NextResponse.json(
            { error: contactError?.message || 'Contact insert failed' },
            { status: 500 }
          )
        }

        contactId = newContact.id
      }

      // =========================
      // CREATE LEAD LINKED TO CONTACT
      // =========================

      const { data: newLead, error: insertError } =
        await supabaseAdmin
          .from('leads')
          .insert([
            {
              account_id: property.account_id,
              contact_id: contactId,
              user_id: event.user_id,
              assigned_user_id: event.user_id,
              first_name,
              last_name,
              email: normalizedEmail,
              phone,
              property_id,
              open_house_event_id,
              hear_about: hear_about || null,
              hear_about_other:
                hear_about === 'Other'
                  ? hear_about_other
                  : null,
              working_with_realtor,
              realtor_name: realtor_name || null,
              buyer_stage: buyer_stage || null,
              wants_feature_sheet:
                wants_feature_sheet ?? false,
              source: 'Open House',
              status: 'New',
            },
          ])
          .select('id')
          .single()

      if (insertError || !newLead) {
        return NextResponse.json(
          { error: insertError?.message || 'Lead insert failed' },
          { status: 500 }
        )
      }

      leadId = newLead.id
    }

    const { error: attendanceError } = await supabaseAdmin
      .from('open_house_attendances')
      .insert([
        {
          lead_id: leadId,
          open_house_event_id,
        },
      ])

    if (attendanceError) {
      return NextResponse.json(
        { error: attendanceError.message },
        { status: 500 }
      )
    }

    // =========================
    // FEATURE SHEET EMAIL + LOGGING
    // =========================
    if (wants_feature_sheet && property.feature_sheet_url) {
      try {
        console.log('DEBUG RESEND_FROM_EMAIL:', process.env.RESEND_FROM_EMAIL)
        
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', event.user_id)
          .single()

        const agentName =
          profile?.full_name || 'Your Realtor'

        const replyToEmail =
          account.owner_email || undefined

        const emailResponse = await resend.emails.send({
          from: 'info@thefcgroup.ca',
          to: normalizedEmail,
          replyTo: replyToEmail,
          subject: `${property.address} – Feature Sheet`,
          html: `
            <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 40px;">
              <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
                <h2 style="margin-top: 0;">Thank You for Visiting</h2>
                <p>Hi ${first_name},</p>
                <p>
                  It was a pleasure meeting you at the open house for
                  <strong>${property.address}</strong>.
                </p>
                <p>You can access the feature sheet below:</p>
                <p style="margin: 30px 0;">
                  <a href="${property.feature_sheet_url}"
                     style="display:inline-block;padding:14px 24px;background:black;color:white;text-decoration:none;border-radius:6px;font-weight:600;">
                     View Feature Sheet
                  </a>
                </p>
                <p>If you have any questions, simply reply to this email.</p>
                <p style="margin-top: 40px;">
                  Best regards,<br/>
                  <strong>${agentName}</strong>
                </p>
              </div>
            </div>
          `,
        })

        await supabaseAdmin
          .from('leads')
          .update({
            feature_sheet_sent_at:
              new Date().toISOString(),
            feature_sheet_status: 'sent',
            feature_sheet_message_id:
              emailResponse?.data?.id || null,
          })
          .eq('id', leadId)
      } catch {
        await supabaseAdmin
          .from('leads')
          .update({
            feature_sheet_sent_at:
              new Date().toISOString(),
            feature_sheet_status: 'failed',
          })
          .eq('id', leadId)
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  }
}
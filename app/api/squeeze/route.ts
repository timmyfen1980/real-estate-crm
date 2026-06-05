import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { Resend } from 'resend'

const rateLimitMap = new Map<
  string,
  { count: number; timestamp: number }
>()

function isRateLimited(ip: string) {
  const now = Date.now()
  const windowMs = 60 * 1000
  const maxRequests = 5

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
      working_with_realtor,
      pre_approved,
      timeline,
    } = body

    if (!first_name || !email || !property_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    const { data: property } = await supabaseAdmin
      .from('properties')
      .select(
        'id, account_id, user_id, feature_sheet_url, address'
      )
      .eq('id', property_id)
      .single()

    if (!property) {
      return NextResponse.json(
        { error: 'Invalid property' },
        { status: 400 }
      )
    }

    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select(
        'owner_user_id, owner_email'
      )
      .eq('id', property.account_id)
      .single()

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 500 }
      )
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', property.user_id)
      .single()

    const agentName =
      profile?.full_name || 'Your Realtor'

    let leadId: string | null = null

    // =====================================
    // REPRESENTED BUYERS
    // =====================================

    if (working_with_realtor === true) {
      if (
        property.feature_sheet_url
      ) {
        await resend.emails.send({
          from: 'info@thefcgroup.ca',
          to: normalizedEmail,
          replyTo:
            account.owner_email || undefined,
          subject: `${property.address} – Feature Sheet`,
          html: `
            <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 40px;">
              <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
                <h2>Feature Sheet Requested</h2>
                <p>Hi ${first_name},</p>
                <p>You can access the feature sheet below.</p>

                <p style="margin:30px 0;">
                  <a
                    href="${property.feature_sheet_url}"
                    style="display:inline-block;padding:14px 24px;background:black;color:white;text-decoration:none;border-radius:6px;"
                  >
                    View Feature Sheet
                  </a>
                </p>

                <p>
                  Regards,<br />
                  ${agentName}
                </p>
              </div>
            </div>
          `,
        })
      }

      if (account.owner_email) {
        await resend.emails.send({
          from: 'info@thefcgroup.ca',
          to: account.owner_email,
          subject:
            'Represented Buyer Requested Feature Sheet',
          html: `
            <h2>Property Inquiry</h2>

            <p><strong>Property:</strong> ${property.address}</p>
            <p><strong>Name:</strong> ${first_name} ${last_name || ''}</p>
            <p><strong>Email:</strong> ${normalizedEmail}</p>
            <p><strong>Phone:</strong> ${phone || 'Not Provided'}</p>
            <p><strong>Working With Realtor:</strong> Yes</p>
            <p><strong>Pre Approved:</strong> ${pre_approved || 'Not Provided'}</p>
            <p><strong>Timeline:</strong> ${timeline || 'Not Provided'}</p>
          `,
        })
      }

      return NextResponse.json({
        success: true,
        skipped: true,
      })
    }

    // =====================================
    // UNREPRESENTED BUYERS
    // =====================================

    let contactId: string

    const { data: existingContact } =
      await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('account_id', property.account_id)
        .eq('email', normalizedEmail)
        .maybeSingle()

    if (existingContact) {
      contactId = existingContact.id
    } else {
      const {
        data: newContact,
        error: contactError,
      } = await supabaseAdmin
        .from('contacts')
        .insert([
          {
            account_id: property.account_id,
            created_by: property.user_id,
            assigned_user_id:
              property.user_id,
            first_name,
            last_name,
            email: normalizedEmail,
            phone,
            lifecycle_stage: 'New',
            source: 'Property Squeeze Page',
            original_source:
              'Property Squeeze Page',
            working_with_realtor: false,
          },
        ])
        .select('id')
        .single()

      if (
        contactError ||
        !newContact
      ) {
        return NextResponse.json(
          {
            error:
              contactError?.message ||
              'Contact insert failed',
          },
          { status: 500 }
        )
      }

      contactId = newContact.id
    }

    const { data: existingLead } =
      await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('account_id', property.account_id)
        .eq('email', normalizedEmail)
        .maybeSingle()

    if (existingLead) {
      leadId = existingLead.id
    } else {
      const {
        data: newLead,
        error: leadError,
      } = await supabaseAdmin
        .from('leads')
        .insert([
          {
            account_id: property.account_id,
            contact_id: contactId,
            user_id: property.user_id,
            assigned_user_id:
              property.user_id,
            first_name,
            last_name,
            email: normalizedEmail,
            phone,
            property_id,
            working_with_realtor: false,
            source: 'Property Squeeze Page',
            status: 'New',
          },
        ])
        .select('id')
        .single()

      if (
        leadError ||
        !newLead
      ) {
        return NextResponse.json(
          {
            error:
              leadError?.message ||
              'Lead insert failed',
          },
          { status: 500 }
        )
      }

      leadId = newLead.id
    }

    if (leadId) {
      await supabaseAdmin
        .from('notes')
        .insert([
          {
            lead_id: leadId,
            user_id: property.user_id,
            content: `
Property Squeeze Page Inquiry

Property:
${property.address}

Pre Approved:
${pre_approved || 'Not Provided'}

Timeline:
${timeline || 'Not Provided'}
            `.trim(),
          },
        ])
    }

    if (
      property.feature_sheet_url
    ) {
      const emailResponse =
        await resend.emails.send({
          from: 'info@thefcgroup.ca',
          to: normalizedEmail,
          replyTo:
            account.owner_email || undefined,
          subject: `${property.address} – Feature Sheet`,
          html: `
            <div style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 40px;">
              <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
                <h2>Feature Sheet Requested</h2>

                <p>Hi ${first_name},</p>

                <p>
                  You can access the feature sheet below.
                </p>

                <p style="margin:30px 0;">
                  <a
                    href="${property.feature_sheet_url}"
                    style="display:inline-block;padding:14px 24px;background:black;color:white;text-decoration:none;border-radius:6px;"
                  >
                    View Feature Sheet
                  </a>
                </p>

                <p>
                  Regards,<br />
                  ${agentName}
                </p>
              </div>
            </div>
          `,
        })

      if (leadId) {
        await supabaseAdmin
          .from('leads')
          .update({
            feature_sheet_sent_at:
              new Date().toISOString(),
            feature_sheet_status: 'sent',
            feature_sheet_message_id:
              emailResponse?.data?.id ||
              null,
          })
          .eq('id', leadId)
      }
    }

    if (account.owner_email) {
      await resend.emails.send({
        from: 'info@thefcgroup.ca',
        to: account.owner_email,
        subject:
          'New Property Squeeze Page Lead',
        html: `
          <h2>New Property Inquiry</h2>

          <p><strong>Property:</strong> ${property.address}</p>
          <p><strong>Name:</strong> ${first_name} ${last_name || ''}</p>
          <p><strong>Email:</strong> ${normalizedEmail}</p>
          <p><strong>Phone:</strong> ${phone || 'Not Provided'}</p>
          <p><strong>Pre Approved:</strong> ${pre_approved || 'Not Provided'}</p>
          <p><strong>Timeline:</strong> ${timeline || 'Not Provided'}</p>
        `,
      })
    }

    return NextResponse.json({
      success: true,
    })
  } catch {
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  }
}
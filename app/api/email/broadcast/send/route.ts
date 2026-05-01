import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const { subject, body_html, contactIds } = body

    if (!subject || !body_html || !contactIds?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // 🔐 Get user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 🧠 Get account
    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', user.id)
      .single()

    if (!membership?.account_id) {
      return NextResponse.json(
        { error: 'No account found' },
        { status: 400 }
      )
    }

    // 📥 Load contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email, do_not_contact, email_opt_in')
      .in('id', contactIds)
      .eq('account_id', membership.account_id)

    if (!contacts) {
      return NextResponse.json({ error: 'No contacts found' })
    }

    // 📥 Load unsubscribes
    const { data: subs } = await supabase
      .from('contact_subscriptions')
      .select('contact_id, unsubscribed')

    const unsubMap: Record<string, boolean> = {}
    subs?.forEach((s) => {
      unsubMap[s.contact_id] = s.unsubscribed
    })

    let sent = 0
    let skipped = 0
    let failed = 0

    // 🔁 LOOP SEND
    for (const contact of contacts) {
      try {
        if (!contact.email) {
          skipped++
          continue
        }

        if (contact.do_not_contact) {
          skipped++
          continue
        }

        if (contact.email_opt_in === false) {
          skipped++
          continue
        }

        if (unsubMap[contact.id]) {
          skipped++
          continue
        }

        const response = await resend.emails.send({
          from: 'The FC Group <info@thefcgroup.ca>',
          to: contact.email,
          subject,
          html: body_html,
        })

        // 🧾 LOG SUCCESS
        await supabase.from('email_logs').insert({
          account_id: membership.account_id,
          contact_id: contact.id,
          subject,
          body_html,
          status: 'sent',
          resend_id: response?.data?.id || null,
        })

        sent++
      } catch (err) {
        failed++

        await supabase.from('email_logs').insert({
          account_id: membership.account_id,
          contact_id: contact.id,
          subject,
          body_html,
          status: 'failed',
        })
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      failed,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Server error', details: err },
      { status: 500 }
    )
  }
}
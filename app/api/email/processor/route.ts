import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(req: Request) {
  // 🔒 CRON SECURITY CHECK
  const authHeader = req.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // 1. Get active campaigns ready to send
    const { data: campaigns, error } = await supabase
      .from('contact_campaigns')
      .select(`
        id,
        contact_id,
        campaign_id,
        current_step,
        next_send_at,
        email_campaigns (
          id,
          name,
          account_id
        )
      `)
      .eq('status', 'active')
      .lte('next_send_at', new Date().toISOString())

    if (error) throw error

    for (const c of campaigns || []) {
      // 2. Get next email step
      const { data: sequence } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('campaign_id', c.campaign_id)
        .eq('step_number', c.current_step)
        .single()

      if (!sequence) continue

      // 3. Get contact email
      const { data: contact } = await supabase
        .from('contacts')
        .select('email, first_name')
        .eq('id', c.contact_id)
        .single()

      if (!contact?.email) continue

      // 4. Replace variables
      const body = sequence.body_html.replace(
        '{{first_name}}',
        contact.first_name || ''
      )

      // 5. Get sender email (FIXED)
      const accountId = c.email_campaigns?.[0]?.account_id || null

      const { data: sender } = await supabase
        .from('email_addresses')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_default', true)
        .single()

      const fromEmail = sender
        ? `${sender.name} <${sender.email}>`
        : 'The FC Group <info@thefcgroup.ca>'

      // 6. Send email
      const send = await resend.emails.send({
        from: fromEmail,
        to: contact.email,
        subject: sequence.subject,
        html: body,
      })

      // 7. Log email (FIXED)
      await supabase.from('email_logs').insert({
        account_id: accountId,
        contact_id: c.contact_id,
        campaign_id: c.campaign_id,
        sequence_id: sequence.id,
        subject: sequence.subject,
        body_html: body,
        status: send?.error ? 'failed' : 'sent',
        resend_id: send?.data?.id,
      })

      // 8. Move to next step
      const nextStep = c.current_step + 1

      const { data: nextSequence } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('campaign_id', c.campaign_id)
        .eq('step_number', nextStep)
        .single()

      if (!nextSequence) {
        // Completed campaign
        await supabase
          .from('contact_campaigns')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', c.id)
      } else {
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + nextSequence.delay_days)

        await supabase
          .from('contact_campaigns')
          .update({
            current_step: nextStep,
            next_send_at: nextDate.toISOString(),
          })
          .eq('id', c.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
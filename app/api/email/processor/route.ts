import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildEmailTemplate } from '@/lib/emailTemplates'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
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

    if (error) throw error

    for (const c of campaigns || []) {
      const { data: sequence } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('campaign_id', c.campaign_id)
        .eq('step_number', c.current_step)
        .single()

      if (!sequence) continue

      // ✅ CONTACT (NOW INCLUDES ACCOUNT)
      const { data: contact } = await supabase
        .from('contacts')
        .select('email, first_name, assigned_user_id, account_id')
        .eq('id', c.contact_id)
        .single()

      if (!contact?.email) continue

      // ✅ AGENT
      const { data: agent } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('id', contact.assigned_user_id)
        .single()

      // ✅ ACCOUNT (BRANDING)
      const { data: account } = await supabase
        .from('accounts')
        .select('team_logo_url, brokerage_logo_url, brokerage_name')
        .eq('id', contact.account_id)
        .single()

      // EMAIL CONTENT
      const rawContent = sequence.body_html.replace(
        '{{first_name}}',
        contact.first_name || ''
      )

      const body = buildEmailTemplate({
        content: rawContent,
        firstName: contact.first_name,
        agentName: agent?.full_name,
        agentPhone: agent?.phone,
        teamLogo: account?.team_logo_url,
        brokerageLogo: account?.brokerage_logo_url,
        brokerageName: account?.brokerage_name,
      })

      // SENDER EMAIL
      const accountId = contact.account_id

      const { data: sender } = await supabase
        .from('email_addresses')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_default', true)
        .single()

      const fromEmail = sender
        ? `${sender.name} <${sender.email}>`
        : 'The FC Group <info@thefcgroup.ca>'

      const send = await resend.emails.send({
        from: fromEmail,
        to: contact.email,
        subject: sequence.subject,
        html: body,
      })

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

      const nextStep = c.current_step + 1

      const { data: nextSequence } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('campaign_id', c.campaign_id)
        .eq('step_number', nextStep)
        .single()

      if (!nextSequence) {
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
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildEmailTemplate } from '@/lib/emailTemplates'

const resend = new Resend(process.env.RESEND_API_KEY)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const {
      subject,
      body_html,
      cta_text,
      cta_link,
    } = body

    // 🔐 GET USER
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 🧠 ACCOUNT
    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', user.id)
      .single()

    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', membership?.account_id)
      .single()

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    // 🧱 BUILD EMAIL
    const html = buildEmailTemplate({
      content: body_html,
      firstName: 'John',
      agentName: profile?.full_name || '',
      agentEmail: user.email,
      agentPhone: profile?.phone || '',
      agentPhoto: profile?.agent_photo_url || '',
      teamLogo: account?.team_logo_url || '',
      brokerageLogo: account?.brokerage_logo_url || '',
      brokerageName: account?.brokerage_name || '',
      unsubscribeLink: `${process.env.NEXT_PUBLIC_SITE_URL}/api/unsubscribe?contact_id=test`,
      ctaLink: cta_link,
      ctaText: cta_text,
    })

    // 📤 SEND TO SELF
    const response = await resend.emails.send({
      from: 'The FC Group <info@thefcgroup.ca>',
      to: user.email,
      subject,
      html,
    })

    return NextResponse.json({
      success: true,
      resend_id: response?.data?.id || null,
    })

  } catch (err) {
    return NextResponse.json(
      { error: 'Send failed', details: err },
      { status: 500 }
    )
  }
}
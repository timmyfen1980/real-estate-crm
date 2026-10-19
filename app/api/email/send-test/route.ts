import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { Resend } from 'resend'
import { buildEmailTemplate } from '@/lib/emailTemplates'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { subject, body_html, cta_text, cta_link } = body

    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized - please log in again' }, { status: 401 })
    }

    let html: string;

    // Check if body_html is already a fully-rendered email (from preview)
    // If so, send it directly without re-wrapping
    const isAlreadyRendered = body_html && (
      body_html.includes('max-width:600px') ||
      body_html.includes('background:#e5e7eb') ||
      body_html.includes('<!-- EMAIL CARD -->')
    );

    if (isAlreadyRendered) {
      // Already a full email - send as-is
      html = body_html;
    } else {
      // Raw content - build the template
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      const { data: membership } = await admin
        .from('account_users')
        .select('account_id')
        .eq('user_id', user.id)
        .single()

      const { data: account } = await admin
        .from('accounts')
        .select('*')
        .eq('id', membership?.account_id)
        .single()

      const { data: profile } = await admin
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      html = buildEmailTemplate({
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
        emailHeaderImage: `${process.env.NEXT_PUBLIC_SITE_URL}/api/email-hero`,
      })
    }

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

  } catch (err: any) {
    console.error('Send test failed:', err)
    return NextResponse.json(
      { error: 'Send failed', details: err?.message || String(err) },
      { status: 500 }
    )
  }
}

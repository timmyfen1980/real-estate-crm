import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEmailTemplate } from '@/lib/emailTemplates'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const body = await req.json()

  const {
    subject,
    body_html,
    cta_text,
    cta_link,
  } = body

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const html = buildEmailTemplate({
    content: body_html,
    firstName: 'John',
    agentName: profile?.full_name || '',
    agentEmail: user.email || '',
    agentPhone: profile?.phone || '',
    agentPhoto: profile?.agent_photo_url || '',
    teamLogo: account?.team_logo_url || '',
    brokerageLogo: account?.brokerage_logo_url || '',
    brokerageName: account?.brokerage_name || '',
    unsubscribeLink: `${process.env.NEXT_PUBLIC_SITE_URL}/api/unsubscribe?contact_id=test`,
    ctaLink: cta_link,
    ctaText: cta_text,
  })

  return NextResponse.json({ html })
}
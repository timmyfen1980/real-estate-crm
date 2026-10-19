import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildEmailTemplate } from '@/lib/emailTemplates';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY!);
const MIGRATION_TOKEN = 'c478b9e1dcb245a3a589ca3a5fe4d47d';

export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (token !== MIGRATION_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Get tenant campaign step 1 (the one Tim is previewing)
  const { data: step } = await supabase
    .from('email_sequences')
    .select('subject, body_html')
    .eq('id', 'dc3a2d9e-66a4-4062-9d8c-e204966bb38b')
    .single();

  if (!step) {
    return NextResponse.json({ ok: false, error: 'step not found' });
  }

  // Use the production domain for the hero (same as real sends)
  const siteOrigin = 'https://crm.thefcgroup.ca';
  
  const html = buildEmailTemplate({
    content: step.body_html,
    firstName: 'Tim',
    agentName: 'Tim Fennessey',
    agentEmail: 'tim@thefcgroup.ca',
    agentPhone: '905 493-7355',
    agentPhoto: 'https://zftihampsyucluajcnmo.supabase.co/storage/v1/object/public/account-assets/a540905b-7cd7-4dd6-bba0-162c07978bd6/agents/tim-headshot.jpg',
    unsubscribeLink: `${siteOrigin}/api/unsubscribe?contact_id=test`,
    emailHeaderImage: `${siteOrigin}/api/email-hero`,
  });

  const { error } = await resend.emails.send({
    from: 'Tim Fennessey <tim@thefcgroup.ca>',
    to: 'tim@thefcgroup.ca',
    subject: `[TEST] ${step.subject}`,
    html,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message });
  }
  return NextResponse.json({ ok: true });
}

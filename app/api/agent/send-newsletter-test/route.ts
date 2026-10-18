import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildEmailTemplate } from '@/lib/emailTemplates';

// GET /api/agent/send-newsletter-test?step=<n> — renders one Monthly Homeowner
// Newsletter step through the EXACT production template (same buildEmailTemplate
// call, same hero, same agent/account blocks, same from-address logic as
// app/api/email/processor) and sends it to tim@thefcgroup.ca so Tim can review
// precisely what subscribers will see. Bearer-gated with REA_AGENT_SECRET.
// Nothing is logged to email_logs and no contact is touched.
const NEWSLETTER_CAMPAIGN_ID = 'bb0b2174-639b-43fc-9f03-2bb289210de2';
const TEST_RECIPIENT = 'tim@thefcgroup.ca';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') || '';
  const secret = process.env.REA_AGENT_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const stepNumber = parseInt(
    request.nextUrl.searchParams.get('step') || '',
    10
  );
  if (!stepNumber) {
    return NextResponse.json(
      { error: 'pass ?step=<step_number>' },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: sequence, error: seqError } = await supabase
    .from('email_sequences')
    .select('id, step_number, subject, body_html, cta_text, cta_link')
    .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
    .eq('step_number', stepNumber)
    .single();

  if (seqError || !sequence) {
    return NextResponse.json({ error: 'step not found' }, { status: 404 });
  }

  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select('account_id')
    .eq('id', NEWSLETTER_CAMPAIGN_ID)
    .single();
  const accountId = campaign?.account_id;

  const { data: account } = accountId
    ? await supabase
        .from('accounts')
        .select(
          'team_logo_url, brokerage_logo_url, brokerage_name, owner_user_id'
        )
        .eq('id', accountId)
        .single()
    : { data: null as any };

  // Agent block: Tim's own profile (he is the sender on real sends).
  let agent: any = null;
  {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, email, phone, agent_photo_url')
      .eq('email', TEST_RECIPIENT)
      .maybeSingle();
    agent = data;
  }
  if (!agent && account?.owner_user_id) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, email, phone, agent_photo_url')
      .eq('id', account.owner_user_id)
      .single();
    agent = data;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  // Same merge-tag handling as the processor (template also replaces
  // {{first_name}} / {{agent_name}} internally).
  const rawContent = (sequence.body_html || '').replace(
    '{{first_name}}',
    'Tim'
  );

  const html = buildEmailTemplate({
    content: rawContent,
    firstName: 'Tim',
    agentName: agent?.full_name,
    agentEmail: agent?.email,
    agentPhone: agent?.phone,
    agentPhoto: agent?.agent_photo_url,
    teamLogo: account?.team_logo_url,
    brokerageLogo: account?.brokerage_logo_url,
    brokerageName: account?.brokerage_name,
    unsubscribeLink: `${siteUrl}/api/unsubscribe?contact_id=test`,
    ctaLink: sequence.cta_link || null,
    ctaText: sequence.cta_text || null,
    emailHeaderImage: `${siteUrl}/api/email-hero`,
  });

  let fromEmail = 'The FC Group <info@thefcgroup.ca>';
  if (accountId) {
    const { data: sender } = await supabase
      .from('email_addresses')
      .select('name, email')
      .eq('account_id', accountId)
      .eq('is_default', true)
      .single();
    if (sender) fromEmail = `${sender.name} <${sender.email}>`;
  }

  const send = await resend.emails.send({
    from: fromEmail,
    to: TEST_RECIPIENT,
    subject: sequence.subject,
    html,
  });

  return NextResponse.json({
    success: true,
    resend_id: (send as any)?.data?.id || null,
    subject: sequence.subject,
    step: stepNumber,
  });
}

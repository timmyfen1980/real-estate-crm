import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET /api/agent/newsletter-content — read-only export of the Monthly Homeowner
// Newsletter steps, for Rea (Tim's agent) to review and improve the newsletter
// month by month. Bearer-gated with REA_AGENT_SECRET; returns subjects, bodies,
// CTAs and delays only — no contact data, no send capabilities.
// v2: redeploy to pick up REA_AGENT_SECRET env var
const NEWSLETTER_CAMPAIGN_ID = 'bb0b2174-639b-43fc-9f03-2bb289210de2';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') || '';
  const secret = process.env.REA_AGENT_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: campaign, error: campaignError } = await supabase
    .from('email_campaigns')
    .select('id, name, description')
    .eq('id', NEWSLETTER_CAMPAIGN_ID)
    .single();

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }

  const { data: steps, error: stepsError } = await supabase
    .from('email_sequences')
    .select('step_number, subject, body_html, cta_text, cta_link, delay_days')
    .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
    .order('step_number');

  if (stepsError) {
    return NextResponse.json({ error: stepsError.message }, { status: 500 });
  }

  return NextResponse.json({ campaign, steps });
}

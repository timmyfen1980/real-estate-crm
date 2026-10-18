import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Bearer-gated: dump FULL content (bodies) for specified campaigns, for review.
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.REA_AGENT_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { campaign_ids } = await request.json();
  const out = [];
  for (const cid of campaign_ids || []) {
    const { data: camp } = await supabase
      .from('email_campaigns')
      .select('id, name')
      .eq('id', cid)
      .single();
    const { data: steps } = await supabase
      .from('email_sequences')
      .select('id, step_number, subject, body_html, cta_text, cta_link')
      .eq('campaign_id', cid)
      .order('step_number');
    out.push({ campaign: camp, steps: steps || [] });
  }
  return NextResponse.json({ campaigns: out });
}

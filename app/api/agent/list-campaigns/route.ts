import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Bearer-gated: list all email campaigns with their steps (for audit/fix).
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.REA_AGENT_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: campaigns } = await supabase
    .from('email_campaigns')
    .select('id, name, created_at')
    .order('created_at', { ascending: true });

  const out = [];
  for (const c of campaigns || []) {
    const { data: steps } = await supabase
      .from('email_sequences')
      .select('id, step_number, subject')
      .eq('campaign_id', c.id)
      .order('step_number');
    out.push({ ...c, steps: steps || [] });
  }

  // Also get agent profiles (photos)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, agent_photo_url');

  return NextResponse.json({ campaigns: out, profiles });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Bearer-gated: update any campaign step's subject/body. POST body:
// { campaign_id, step, subject?, body_html? }
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.REA_AGENT_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { campaign_id, step, subject, body_html } = await request.json();
  if (!campaign_id || !step) {
    return NextResponse.json(
      { error: 'campaign_id and step are required' },
      { status: 400 }
    );
  }

  const patch: any = {};
  if (subject !== undefined) patch.subject = subject;
  if (body_html !== undefined) patch.body_html = body_html;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('email_sequences')
    .update(patch)
    .eq('campaign_id', campaign_id)
    .eq('step_number', step)
    .select('id, step_number, subject');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: data });
}

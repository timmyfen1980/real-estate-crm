import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Bearer-gated: update a newsletter step's body_html (for monthly content polish).
// POST body: { step: number, body_html: string }
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.REA_AGENT_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { step, body_html } = await request.json();
  if (!step || !body_html) {
    return NextResponse.json(
      { error: 'step and body_html are required' },
      { status: 400 }
    );
  }

  const CAMPAIGN_ID = 'bb0b2174-639b-43fc-9f03-2bb289210de2';

  const { data, error } = await supabase
    .from('email_sequences')
    .update({ body_html })
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('step_number', step)
    .select('id, step_number, subject');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: data });
}

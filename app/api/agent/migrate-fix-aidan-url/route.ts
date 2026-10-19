import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIGRATION_TOKEN = '99353afe47544b91a31fff483998745d';
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (token !== MIGRATION_TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const newUrl = 'https://zftihampsyucluajcnmo.supabase.co/storage/v1/object/public/account-assets/a540905b-7cd7-4dd6-bba0-162c07978bd6/agents/aidan-headshot.jpg';
  const { error } = await supabase.from('profiles').update({ agent_photo_url: newUrl }).ilike('full_name', '%aidan%');
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIGRATION_TOKEN = 'cec8551c9835472ba5a4676640e932b6';
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (token !== MIGRATION_TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, agent_photo_url').limit(20);
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true, profiles: data });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIGRATION_TOKEN = '58de28a89ea24a67a57a29b1e6a193fd';
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (token !== MIGRATION_TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Get account users with their profiles
  const { data, error } = await supabase
    .from('account_users')
    .select('user_id, role, profiles(id, full_name, email, agent_photo_url)')
    .eq('account_id', 'a540905b-7cd7-4dd6-bba0-162c07978bd6');
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true, agents: data });
}

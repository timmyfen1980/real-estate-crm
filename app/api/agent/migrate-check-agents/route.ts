import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIGRATION_TOKEN = '12a315c90afc42ebbdf095b0eec77af9';
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (token !== MIGRATION_TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Get all agents and their photo URLs
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, agent_photo_url')
    .eq('account_id', 'a540905b-7cd7-4dd6-bba0-162c07978bd6');
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true, agents: data });
}

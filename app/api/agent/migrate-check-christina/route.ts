import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIGRATION_TOKEN = '8dd55f66084b4247b603c4c58b0069ad';
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (token !== MIGRATION_TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  
  // Check profiles for Christina
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').ilike('full_name', '%christina%');
  
  // Check account_users for any related entries
  const { data: allUsers } = await supabase.from('account_users').select('user_id, role').eq('account_id', 'a540905b-7cd7-4dd6-bba0-162c07978bd6');
  
  return NextResponse.json({ ok: true, christina_profiles: profiles, total_users: allUsers?.length });
}

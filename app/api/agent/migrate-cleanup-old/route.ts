import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIGRATION_TOKEN = '5570fe85756546f89e4ab105faa84528';
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (token !== MIGRATION_TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Remove the old 27MB Aidan photo
  const { error } = await supabase.storage.from('account-assets').remove(['a540905b-7cd7-4dd6-bba0-162c07978bd6/agents/1776543447950-LLM01684.jpg']);
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true, removed: 'old Aidan photo' });
}

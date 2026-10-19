import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIGRATION_TOKEN = 'e0d654febfa647e682ad73b54016a6ce';
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (token !== MIGRATION_TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Update the account's email_header_image_url to the live hero route
  const { data, error } = await supabase
    .from('accounts')
    .update({ email_header_image_url: 'https://crm.thefcgroup.ca/api/email-hero' })
    .eq('id', 'a540905b-7cd7-4dd6-bba0-162c07978bd6')
    .select('id, email_header_image_url');
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true, data });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIGRATION_TOKEN = 'b42666c4e29a418c9ca5adebfb9a1873';
export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (token !== MIGRATION_TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Upload current hero to Supabase
  const buf = Buffer.from(readFileSync(join(process.cwd(), 'public', 'email-hero.b64'), 'utf8').trim(), 'base64');
  const { error } = await supabase.storage.from('account-assets').upload('a540905b-7cd7-4dd6-bba0-162c07978bd6/brand/email-hero.jpg', buf, { contentType: 'image/jpeg', upsert: true });
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Bearer-gated: replaces the agent's AI-generated profile photo with the real
// headshot (public/tim-headshot.jpg) stored in the account-assets bucket.
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.REA_AGENT_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  // Find the user by email via auth admin.
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users.find(
    (u) => u.email?.toLowerCase() === String(email).toLowerCase()
  );
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }

  // Find their account.
  const { data: membership } = await supabase
    .from('account_users')
    .select('account_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  if (!membership) {
    return NextResponse.json({ error: 'no account membership' }, { status: 404 });
  }
  const accountId = (membership as any).account_id;

  // Upload the real headshot.
  const buf = Buffer.from(readFileSync(join(process.cwd(), 'public', 'tim-headshot.b64'), 'utf8').trim(), 'base64');
  const storagePath = `${accountId}/agents/tim-headshot.jpg`;
  const { error: upErr } = await supabase.storage
    .from('account-assets')
    .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: true });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('account-assets').getPublicUrl(storagePath);

  // Point the profile at the real photo.
  const { error: profErr } = await supabase
    .from('profiles')
    .update({ agent_photo_url: publicUrl })
    .eq('id', user.id);
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, agent_photo_url: publicUrl });
}

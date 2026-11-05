import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const FC_ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';
const BUCKET = 'account-assets';

// Fixed slots kept from the original page. Anything else sent as imageId is
// treated as a team member's user id (the Brand Images page sends those), so
// any current or future agent can get a headshot the same way.
const LEGACY_PATHS: Record<string, string> = {
  hero: 'brand/email-hero.jpg',
  tim: 'agents/tim-headshot.jpg',
  aidan: 'agents/aidan-headshot.jpg',
};

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    const accountId = (membership as any)?.account_id || FC_ACCOUNT_ID;

    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const imageId = formData.get('imageId') as string | null;

    if (!file || !imageId) {
      return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'image/jpeg';

    let storagePath: string;
    let memberId: string | null = null;

    if (LEGACY_PATHS[imageId]) {
      storagePath = `${accountId}/${LEGACY_PATHS[imageId]}`;
    } else {
      // Member upload: the id must belong to a member of the caller's account.
      const { data: memberRow } = await supabase
        .from('account_users')
        .select('user_id')
        .eq('account_id', accountId)
        .eq('user_id', imageId)
        .limit(1)
        .single();
      if (!memberRow) {
        return NextResponse.json({ error: 'Unknown image' }, { status: 400 });
      }
      memberId = imageId;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, agent_photo_url')
        .eq('id', memberId)
        .single();

      const marker = `/object/public/${BUCKET}/`;
      const existing = (profile as any)?.agent_photo_url as string | null;
      if (existing && existing.includes(marker)) {
        // Reuse the file this member already points at, so every place that
        // shows the photo updates in place.
        storagePath = decodeURIComponent(existing.split(marker)[1].split('?')[0]);
      } else {
        const first =
          ((profile as any)?.full_name || 'agent')
            .split(' ')[0]
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '') || 'agent';
        const { data: allProfiles } = await supabase
          .from('profiles')
          .select('agent_photo_url');
        const used = new Set(
          (allProfiles || []).map((p: any) => p.agent_photo_url || '')
        );
        const urlFor = (p: string) =>
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p}`;
        let candidate = `${accountId}/agents/${first}-headshot.jpg`;
        let n = 2;
        while (used.has(urlFor(candidate))) {
          candidate = `${accountId}/agents/${first}-${n}-headshot.jpg`;
          n++;
        }
        storagePath = candidate;
      }
    }

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buf, { contentType, upsert: true });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    if (memberId) {
      // Point the member's profile at the photo so signatures pick it up.
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ agent_photo_url: publicUrl })
        .eq('id', memberId);
      if (profErr) {
        return NextResponse.json({ error: profErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, path: storagePath, agent_photo_url: publicUrl });
    }

    return NextResponse.json({ ok: true, path: storagePath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}

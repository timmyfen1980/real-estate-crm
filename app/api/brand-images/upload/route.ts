import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

// Map image IDs to storage paths
const PATHS: Record<string, string> = {
  hero: `${ACCOUNT_ID}/brand/email-hero.jpg`,
  tim: `${ACCOUNT_ID}/agents/tim-headshot.jpg`,
  aidan: `${ACCOUNT_ID}/agents/aidan-headshot.jpg`,
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const imageId = formData.get('imageId') as string;

    if (!file || !imageId || !PATHS[imageId]) {
      return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const path = PATHS[imageId];

    const { error } = await supabase.storage
      .from('account-assets')
      .upload(path, buf, { contentType: 'image/jpeg', upsert: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, path });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const storagePath = formData.get('path') as string; // e.g. team-docs/buyer/filename.pdf

    if (!file || !storagePath) {
      return NextResponse.json({ error: 'Missing file or path' }, { status: 400 });
    }

    // Validate path is within team-docs
    if (!storagePath.startsWith('team-docs/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage
      .from('client-documents')
      .upload(storagePath, buf, {
        contentType: file.type || 'application/octet-stream',
        upsert: true, // Overwrite if exists (for Replace)
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, path: storagePath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

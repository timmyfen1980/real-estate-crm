import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// POST /api/upload-team-docs — TEMPORARY admin route for the team-docs migration.
// Two modes:
//  1. multipart form-data with `file` + `folder` ('buyer' | 'seller')
//  2. JSON { dropboxUrl, folder, filename } — server downloads the file itself
//     (bypasses Vercel's 4.5MB request-body limit for large files like the 11MB pptx)
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let buffer: Buffer;
    let folder: string;
    let filename: string;
    let mime = 'application/octet-stream';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      const url = body.dropboxUrl as string;
      folder = body.folder as string;
      filename = body.filename as string;
      if (!url || !folder || !filename) {
        return NextResponse.json(
          { error: 'dropboxUrl, folder and filename required' },
          { status: 400 }
        );
      }
      const dlUrl = url.replace('dl=0', 'dl=1');
      const res = await fetch(dlUrl, { redirect: 'follow' });
      if (!res.ok) {
        return NextResponse.json(
          { error: `source download failed: ${res.status}` },
          { status: 502 }
        );
      }
      buffer = Buffer.from(await res.arrayBuffer());
      mime = res.headers.get('content-type') || mime;
    } else {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      folder = formData.get('folder') as string;
      if (!file || !folder) {
        return NextResponse.json(
          { error: 'file and folder required' },
          { status: 400 }
        );
      }
      buffer = Buffer.from(await file.arrayBuffer());
      filename = file.name;
      mime = file.type || mime;
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const storagePath = `team-docs/${folder}/${filename}`;

    const { error } = await supabase.storage
      .from('client-documents')
      .upload(storagePath, buffer, {
        contentType: mime,
        upsert: true,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, path: storagePath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

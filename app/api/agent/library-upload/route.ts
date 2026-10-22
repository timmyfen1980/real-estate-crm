/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/agent/library-upload — Rea (Bearer REA_AGENT_SECRET) adds
// a document to the team library (Supabase storage, client-documents
// bucket, team-docs/<folder>/). Body: { folder, name, file_b64 }.
// Folders mirror the Documents page: buyer | seller | renter. The
// Documents page lists files explicitly, so a new upload also needs
// its entry added there before the team sees it.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const FOLDERS = ['buyer', 'seller', 'renter'];

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (
    !process.env.REA_AGENT_SECRET ||
    auth !== `Bearer ${process.env.REA_AGENT_SECRET}`
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const folder = String(body.folder || '');
    const name = String(body.name || '');
    const fileB64 = String(body.file_b64 || '');
    if (!FOLDERS.includes(folder)) {
      return NextResponse.json(
        { error: 'folder must be buyer, seller or renter' },
        { status: 400 }
      );
    }
    if (!name || name.includes('/') || name.includes('..')) {
      return NextResponse.json({ error: 'bad name' }, { status: 400 });
    }
    if (!fileB64) {
      return NextResponse.json(
        { error: 'file_b64 required' },
        { status: 400 }
      );
    }
    const bytes = Buffer.from(fileB64, 'base64');
    if (!bytes.length) {
      return NextResponse.json({ error: 'empty file' }, { status: 400 });
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const path = `team-docs/${folder}/${name}`;
    const { error } = await supabase.storage
      .from('client-documents')
      .upload(path, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, path, bytes: bytes.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'upload failed' },
      { status: 500 }
    );
  }
}

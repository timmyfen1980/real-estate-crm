/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/agent/template-upload — Rea (Bearer <redacted>) uploads
// an OREA blank into the offer-template store (Supabase storage,
// client-documents bucket, system/offer-templates/). Body:
// { name: "form371.pdf", file_b64 }. Names are restricted to
// form<digits>.pdf so this route can only ever write generator
// templates — the offer generate route reads them back by name.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const name = String(body.name || '');
    const fileB64 = String(body.file_b64 || '');
    if (!/^form\d+\.pdf$/.test(name)) {
      return NextResponse.json(
        { error: 'name must look like form371.pdf' },
        { status: 400 }
      );
    }
    if (!fileB64) {
      return NextResponse.json({ error: 'file_b64 required' }, { status: 400 });
    }
    const bytes = Buffer.from(fileB64, 'base64');
    if (!bytes.length || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return NextResponse.json(
        { error: 'file_b64 is not a PDF' },
        { status: 400 }
      );
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const path = `system/offer-templates/${name}`;
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

// POST /api/checklists/upload — Beth uploads a document for a client file (Path B).
// Body: multipart form-data with `file`, `clientFileId`, `documentId`.
// Stores in Supabase Storage (client-documents bucket), marks the document received.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const clientFileId = formData.get('clientFileId') as string | null;
    const documentId = formData.get('documentId') as string | null;

    if (!file || !clientFileId || !documentId) {
      return NextResponse.json(
        { error: 'file, clientFileId, and documentId are required' },
        { status: 400 }
      );
    }

    // Sanitize filename and build storage path
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${clientFileId}/${documentId}/${Date.now()}_${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from('client-documents')
      .upload(storagePath, buffer, { contentType: file.type || 'application/octet-stream' });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Mark the document as received
    const { error: dbError } = await supabaseAdmin
      .from('client_documents')
      .update({
        status: 'received',
        received_at: new Date().toISOString(),
        received_via: 'manual',
        file_url: storagePath,
      })
      .eq('id', documentId);

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, file_url: storagePath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}

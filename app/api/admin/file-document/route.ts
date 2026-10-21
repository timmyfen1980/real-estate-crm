// POST /api/admin/file-document — agent-side document filing for client files.
// Auth: Bearer REA_AGENT_SECRET header. Service-role client.
// Mirrors the CRM checklist page's team-upload behaviour exactly:
//   storage path  {client_file_id}/{doc_id}_{timestamp}.{ext}  in bucket client-documents
//   client_documents row -> file_url = 1-year signed URL, status 'received',
//   received_at = now, received_via = 'upload'
// Actions:
//   { action: 'lookup', contact_id }  (JSON) -> client files + document rows for a contact
//   multipart form: action='file', doc_id, file  -> uploads and marks the row received

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const FC_ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

function unauthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  return !token || token !== process.env.REA_AGENT_SECRET;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    if (unauthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const supabase = serviceClient();
    const contentType = req.headers.get('content-type') || '';

    // ---- Multipart: file a document ----
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const action = String(form.get('action') || '');
      const docId = String(form.get('doc_id') || '');
      const file = form.get('file');
      if (action !== 'file' || !docId || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'Need action=file, doc_id, and a file.' },
          { status: 400 }
        );
      }

      const { data: doc, error: docError } = await supabase
        .from('client_documents')
        .select('id, client_file_id, document, status, file_url')
        .eq('id', docId)
        .single();
      if (docError || !doc) {
        return NextResponse.json(
          { error: 'Document row not found.' },
          { status: 404 }
        );
      }

      const { data: clientFile, error: fileError } = await supabase
        .from('client_files')
        .select('id, account_id')
        .eq('id', doc.client_file_id)
        .single();
      if (fileError || !clientFile || clientFile.account_id !== FC_ACCOUNT_ID) {
        return NextResponse.json(
          { error: 'Client file not found for this account.' },
          { status: 404 }
        );
      }

      const rawExt = (file.name.split('.').pop() || 'pdf').toLowerCase();
      const ext = /^[a-z0-9]{1,10}$/.test(rawExt) ? rawExt : 'pdf';
      const storagePath = `${doc.client_file_id}/${doc.id}_${Date.now()}.${ext}`;

      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from('client-documents')
        .upload(storagePath, bytes, {
          contentType: file.type || 'application/pdf',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from('client-documents')
        .createSignedUrl(storagePath, 31536000);

      const { error: updateError } = await supabase
        .from('client_documents')
        .update({
          file_url: urlData?.signedUrl || '',
          status: 'received',
          received_at: new Date().toISOString(),
          received_via: 'upload',
        })
        .eq('id', doc.id);
      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true,
        doc_id: doc.id,
        document: doc.document,
        storage_path: storagePath,
        status: 'received',
      });
    }

    // ---- JSON: lookup ----
    const body = (await req.json()) as {
      action?: string;
      contact_id?: string;
      name?: string;
      deal_id?: string;
    };
    if (
      body.action === 'lookup' &&
      (body.contact_id || body.name || body.deal_id)
    ) {
      let query = supabase
        .from('client_files')
        .select(
          'id, account_id, checklist_types, client_names, property_address, crm_contact_id, crm_deal_id'
        );
      if (body.contact_id) query = query.eq('crm_contact_id', body.contact_id);
      if (body.deal_id) query = query.eq('crm_deal_id', body.deal_id);
      if (body.name) query = query.ilike('client_names', `%${body.name}%`);
      const { data: files, error: filesError } = await query;
      if (filesError) throw filesError;

      const fileIds = (files || []).map((f) => f.id);
      let docs: unknown[] = [];
      if (fileIds.length > 0) {
        const { data: docRows, error: docsError } = await supabase
          .from('client_documents')
          .select(
            'id, client_file_id, checklist_type, stage_index, doc_index, document, status, file_url'
          )
          .in('client_file_id', fileIds)
          .order('stage_index')
          .order('doc_index');
        if (docsError) throw docsError;
        docs = docRows || [];
      }
      return NextResponse.json({ ok: true, files: files || [], documents: docs });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

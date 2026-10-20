// GET /api/client-doc-url?path=<storage path>&download=1
// Returns a long-lived signed URL for a client document in the private
// client-documents bucket. Documents uploaded by clients through the
// website portal store the raw storage path in client_documents.file_url
// (e.g. "<fileId>/<docId>/1234567890_paystub.pdf"), while team uploads
// store a signed URL — the checklist page resolves path-based entries
// through this route at load time so its View/Download links work.
// Session-authenticated: only logged-in team members can mint URLs.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get('path') || '';
  const download = searchParams.get('download') === '1';

  // Normalize to a plain path inside the bucket: tolerate a leading slash
  // or a "client-documents/" prefix, reject URLs and traversal outright.
  let path = rawPath.trim();
  if (path.startsWith('/')) path = path.slice(1);
  if (path.startsWith('client-documents/')) {
    path = path.slice('client-documents/'.length);
  }
  if (!path || path.includes('..') || path.includes('://')) {
    return NextResponse.json({ error: 'Invalid storage path.' }, { status: 400 });
  }

  const filename = path.split('/').pop() || 'document';
  const { data, error } = await supabaseAdmin.storage
    .from('client-documents')
    .createSignedUrl(
      path,
      60 * 60 * 24 * 365, // 1 year, same convention as /api/team-doc-url
      download ? { download: filename } : undefined
    );

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message || 'could not sign url' },
      { status: 500 }
    );
  }
  return NextResponse.json({ url: data.signedUrl });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/team-doc-url?path=team-docs/buyer/foo.pdf&download=1
// Returns a long-lived signed URL for a team document in the private bucket.
// Restricted to the team-docs/ prefix so this can't sign arbitrary bucket paths.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '';
  const download = searchParams.get('download') === '1';

  if (!path.startsWith('team-docs/') || path.includes('..')) {
    return NextResponse.json(
      { error: 'path must be inside team-docs/' },
      { status: 400 }
    );
  }

  const filename = path.split('/').pop() || 'document.pdf';
  const { data, error } = await supabaseAdmin.storage
    .from('client-documents')
    .createSignedUrl(
      path,
      60 * 60 * 24 * 365, // 1 year, same convention as checklist file links
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

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Bearer-gated: find a property by address fragment and list associated documents.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.REA_AGENT_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q') || '';

  // Find matching properties
  const { data: props } = await supabase
    .from('properties')
    .select('*')
    .ilike('address', `%${q}%`)
    .limit(5);

  const results = [];
  for (const p of props || []) {
    // Look for documents linked to this property (client_files by property_address)
    const { data: files } = await supabase
      .from('client_files')
      .select('id, property_address, client_name')
      .ilike('property_address', `%${q}%`)
      .limit(5);

    // Look for documents in client_documents for those files
    let docs: any[] = [];
    for (const f of files || []) {
      const { data: d } = await supabase
        .from('client_documents')
        .select('id, file_name, document_type, file_url, created_at')
        .eq('client_file_id', f.id)
        .limit(20);
      if (d) docs = docs.concat(d.map((x: any) => ({ ...x, client_file: f.client_name })));
    }

    results.push({ property: p, files, documents: docs });
  }

  return NextResponse.json({ results });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MIGRATION_TOKEN = '6e5886f09c4f444992595373c3bcb1ce';

const EMAILS = [
  'bmgscott@sympatico.ca',
  'rollandtire@gmail.com',
  'berniceg@sympatico.ca',
  '2mcmanus@rogers.com',
  'mikemelinyshyn@aol.com',
  'rtest@fenn.ca',
  'diion700@hotmail.com',
  'dmaundrell@trebnet.com',
  'dan.nadeau@harley-davidson.com',
  'mandy_mackenzie@hotmail.com',
  'jennifere@remaxhallmark.com',
  'stephandtris@sympatico.ca',
  'shariandjim@rogers.com',
  'kedasilva@sympatico.ca',
  'lcuell@ca.ibm.com',
  'kamoxley@rogers.com',
  'jimartin@rogers.com',
  'jill.moxley@mackiegroup.com',
  'jandrus@rogers.com',
  'bgrylls@rogers.com',
  'atgoat14@gmail.com',
  'vanameromkj@gmail.com',
  'jdmcewen@mac.com',
  'shyami@hotmail.com',
  'jessejlenis@hotmail.ca',
  'fargoe@rogers.com',
  'michael_mcivor@cooperators.ca',
  'dgleed@thelivingbenefitsgroup.com',
  'ameek@epso.ca',
  'senatord5@hotmail.com',
  'hpannand@gmail.com',
  't@ff.cx',
  'test@four.ca',
];

export async function POST(request: NextRequest) {
  const { token, confirm } = await request.json();
  if (token !== MIGRATION_TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (confirm !== 'DELETE_PERMANENTLY') return NextResponse.json({ error: 'confirmation required' }, { status: 400 });

  const results: any = { deleted_contacts: 0, deleted_campaign_links: 0, deleted_logs: 0, not_found: [] as string[] };

  for (const email of EMAILS) {
    // Find contacts with this email
    const { data: contacts } = await supabase.from('contacts').select('id').ilike('email', email);
    if (!contacts || contacts.length === 0) {
      results.not_found.push(email);
      continue;
    }
    const ids = contacts.map((c: any) => c.id);

    // Delete from junction tables first
    const { count: cc } = await supabase.from('contact_campaigns').delete({ count: 'exact' }).in('contact_id', ids);
    results.deleted_campaign_links += cc || 0;

    const { count: logs } = await supabase.from('email_logs').delete({ count: 'exact' }).in('contact_id', ids);
    results.deleted_logs += logs || 0;

    // Delete contacts
    const { count: del } = await supabase.from('contacts').delete({ count: 'exact' }).in('id', ids);
    results.deleted_contacts += del || 0;
  }

  return NextResponse.json({ ok: true, results });
}

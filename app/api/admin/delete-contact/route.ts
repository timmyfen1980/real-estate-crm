/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/admin/delete-contact — one-time admin cleanup of a test contact.
// Body: { email }
// Auth: Bearer <REA_AGENT_SECRET> header.
// Deletes the contact and all dependent rows in FK-safe order (children first).
// Deals are NOT deleted — their contact_id is set to null instead.
// Returns per-table deletion counts.
// v2: retrigger deployment

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token !== process.env.REA_AGENT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const email = (body.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Email required.' }, { status: 400 });
    }

    // Find the contact (email is unique per account; take the most recent match)
    const { data: contacts, error: findErr } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, account_id, created_at')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(5);

    if (findErr) throw findErr;
    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ error: 'No contact found for that email.' }, { status: 404 });
    }
    if (contacts.length > 1) {
      return NextResponse.json(
        {
          error: 'Multiple contacts match that email. Refusing to guess.',
          matches: contacts.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, created_at: c.created_at })),
        },
        { status: 409 }
      );
    }

    const contact = contacts[0];
    const contactId = contact.id;
    const deleted: Record<string, number> = {};

    async function countDelete(table: string, column: string, value: string): Promise<number> {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq(column, value);
      if (error) throw new Error(`${table}: ${error.message}`);
      return count || 0;
    }

    // 1. Giveaway entries
    deleted.giveaway_entries = await countDelete('giveaway_entries', 'contact_id', contactId);

    // 2. Campaign memberships
    deleted.contact_campaigns = await countDelete('contact_campaigns', 'contact_id', contactId);

    // 3. Email logs
    deleted.email_logs = await countDelete('email_logs', 'contact_id', contactId);

    // 4. Client files + their documents
    const { data: files, error: filesErr } = await supabase
      .from('client_files')
      .select('id')
      .eq('crm_contact_id', contactId);
    if (filesErr) throw new Error(`client_files lookup: ${filesErr.message}`);

    let docsDeleted = 0;
    let filesDeleted = 0;
    for (const f of files || []) {
      const { error: docErr, count: docCount } = await supabase
        .from('client_documents')
        .delete({ count: 'exact' })
        .eq('client_file_id', f.id);
      if (docErr) throw new Error(`client_documents: ${docErr.message}`);
      docsDeleted += docCount || 0;

      const { error: fileErr } = await supabase.from('client_files').delete().eq('id', f.id);
      if (fileErr) throw new Error(`client_files: ${fileErr.message}`);
      filesDeleted += 1;
    }
    deleted.client_documents = docsDeleted;
    deleted.client_files = filesDeleted;

    // 5. Property links
    deleted.property_contacts = await countDelete('property_contacts', 'contact_id', contactId);

    // 6. Deals: null the FK rather than deleting deal records
    const { error: dealsErr, count: dealsCount } = await supabase
      .from('deals')
      .update({ contact_id: null }, { count: 'exact' })
      .eq('contact_id', contactId);
    if (dealsErr) throw new Error(`deals: ${dealsErr.message}`);
    deleted.deals_unlinked = dealsCount || 0;

    // 7. Finally the contact itself
    const { error: contactErr } = await supabase.from('contacts').delete().eq('id', contactId);
    if (contactErr) throw new Error(`contacts: ${contactErr.message}`);
    deleted.contacts = 1;

    return NextResponse.json({
      ok: true,
      deleted_contact: {
        id: contactId,
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        email: contact.email,
      },
      deleted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Delete failed.' }, { status: 500 });
  }
}

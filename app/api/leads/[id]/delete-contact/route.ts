/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/leads/[id]/delete-contact — permanently delete the contact
// behind a lead, from the lead page (Tim, 2026-11-11).
// Session auth: the signed-in user must belong to the lead's account.
// Deletes the contact and all dependent rows in FK-safe order (children
// first), mirroring /api/admin/delete-contact and additionally clearing
// tasks, notes, lead activity and open-house attendances, which also
// reference the lead/contact. Deals are NOT deleted — their contact_id
// is set to null instead. Returns per-table deletion counts.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

async function requireUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user;
}

function serviceDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }

    const { id: leadId } = await params;
    const supabase = serviceDb();

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id, role')
      .eq('user_id', user.id)
      .single();
    if (!membership) {
      return NextResponse.json(
        { error: 'No account for this user.' },
        { status: 403 }
      );
    }

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, contact_id, account_id')
      .eq('id', leadId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }
    if (lead.account_id !== membership.account_id) {
      return NextResponse.json(
        { error: 'That lead is not on your account.' },
        { status: 403 }
      );
    }
    if (!lead.contact_id) {
      return NextResponse.json(
        {
          error:
            'This lead is not linked to a contact, so there is no contact to delete.',
        },
        { status: 400 }
      );
    }

    const contactId = lead.contact_id as string;

    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email')
      .eq('id', contactId)
      .maybeSingle();
    if (contactErr) throw contactErr;
    if (!contact) {
      return NextResponse.json(
        { error: 'The linked contact no longer exists.' },
        { status: 404 }
      );
    }

    const deleted: Record<string, number> = {};

    async function countDelete(
      table: string,
      column: string,
      value: string
    ): Promise<number> {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq(column, value);
      if (error) throw new Error(`${table}: ${error.message}`);
      return count || 0;
    }

    async function countDeleteIn(
      table: string,
      column: string,
      values: string[]
    ): Promise<number> {
      if (values.length === 0) return 0;
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .in(column, values);
      if (error) throw new Error(`${table}: ${error.message}`);
      return count || 0;
    }

    // Every lead belonging to this contact (a contact can have several).
    const { data: leadRows, error: leadsErr } = await supabase
      .from('leads')
      .select('id')
      .eq('contact_id', contactId);
    if (leadsErr) throw new Error(`leads lookup: ${leadsErr.message}`);
    const leadIds = (leadRows || []).map((l: any) => l.id as string);

    // 1. Rows that reference the lead and/or the contact directly.
    deleted.tasks =
      (await countDelete('tasks', 'contact_id', contactId)) +
      (await countDeleteIn('tasks', 'lead_id', leadIds));
    deleted.lead_activity =
      (await countDelete('lead_activity', 'contact_id', contactId)) +
      (await countDeleteIn('lead_activity', 'lead_id', leadIds));
    deleted.notes =
      (await countDelete('notes', 'contact_id', contactId)) +
      (await countDeleteIn('notes', 'lead_id', leadIds));
    deleted.open_house_attendances = await countDeleteIn(
      'open_house_attendances',
      'lead_id',
      leadIds
    );

    // 2. Giveaway entries
    deleted.giveaway_entries = await countDelete(
      'giveaway_entries',
      'contact_id',
      contactId
    );

    // 3. Campaign memberships (drip + newsletter enrollments). Deleting
    // these is what keeps the email processor from ever choking on an
    // orphaned enrollment (the 2026-11-06 incident).
    deleted.contact_campaigns = await countDelete(
      'contact_campaigns',
      'contact_id',
      contactId
    );

    // 4. Email logs
    deleted.email_logs = await countDelete('email_logs', 'contact_id', contactId);

    // 5. Client files + their documents
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

      const { error: fileErr } = await supabase
        .from('client_files')
        .delete()
        .eq('id', f.id);
      if (fileErr) throw new Error(`client_files: ${fileErr.message}`);
      filesDeleted += 1;
    }
    deleted.client_documents = docsDeleted;
    deleted.client_files = filesDeleted;

    // 6. Property links
    deleted.property_contacts = await countDelete(
      'property_contacts',
      'contact_id',
      contactId
    );

    // 7. The leads themselves
    deleted.leads = await countDelete('leads', 'contact_id', contactId);

    // 8. Deals: null the FK rather than deleting deal records
    const { error: dealsErr, count: dealsCount } = await supabase
      .from('deals')
      .update({ contact_id: null }, { count: 'exact' })
      .eq('contact_id', contactId);
    if (dealsErr) throw new Error(`deals: ${dealsErr.message}`);
    deleted.deals_unlinked = dealsCount || 0;

    // 9. Finally the contact itself
    const { error: delErr } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId);
    if (delErr) throw new Error(`contacts: ${delErr.message}`);
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
    return NextResponse.json(
      { error: err.message || 'Delete failed.' },
      { status: 500 }
    );
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/lead-cleanup — one-time (and re-runnable) lead hygiene sweep.
// Auth: Bearer REA_AGENT_SECRET
//
// POST { action: 'report' }  -> lists, WITHOUT changing anything:
//   - to_convert: open leads (status not Client/Closed/Lost) whose contact
//     already has a deal (any status) or a client file — these are clients
//     still sitting in the working leads list.
//   - duplicates: contacts with more than one non-Lost lead row.
// POST { action: 'convert' } -> sets the to_convert leads to status
//   'Client' and logs a lead_activity row (type 'auto_converted',
//   user_id null = System). Duplicates are report-only; merging them is
//   a human decision.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';
const OPEN_STATUSES = ['New', 'Contacted', 'Hot', 'Cold'];

function authorized(req: NextRequest): boolean {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  return !!token && token === process.env.REA_AGENT_SECRET;
}

function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

async function computeReport(supabase: SupabaseClient) {
  const { data: openLeads, error: leadError } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, status, deal_type, contact_id, created_at')
    .eq('account_id', ACCOUNT_ID)
    .in('status', OPEN_STATUSES);
  if (leadError) throw leadError;

  const leads = (openLeads || []).filter((l: any) => !!l.contact_id);
  const contactIds: string[] = [];
  for (const l of leads) {
    if (contactIds.indexOf(l.contact_id) < 0) contactIds.push(l.contact_id);
  }

  const dealContacts = new Set<string>();
  const fileContacts = new Set<string>();
  if (contactIds.length > 0) {
    const { data: dealRows, error: dealError } = await supabase
      .from('deals')
      .select('contact_id')
      .eq('account_id', ACCOUNT_ID)
      .in('contact_id', contactIds);
    if (dealError) throw dealError;
    for (const d of dealRows || []) {
      if (d.contact_id) dealContacts.add(d.contact_id);
    }

    const { data: fileRows, error: fileError } = await supabase
      .from('client_files')
      .select('crm_contact_id')
      .in('crm_contact_id', contactIds);
    if (fileError) throw fileError;
    for (const f of fileRows || []) {
      if (f.crm_contact_id) fileContacts.add(f.crm_contact_id);
    }
  }

  const toConvert = leads
    .filter((l: any) => dealContacts.has(l.contact_id) || fileContacts.has(l.contact_id))
    .map((l: any) => ({
      lead_id: l.id,
      name: (l.first_name + ' ' + l.last_name).trim(),
      email: l.email || null,
      status: l.status,
      deal_type: l.deal_type || null,
      reason: dealContacts.has(l.contact_id)
        ? 'contact has a deal'
        : 'contact has a client file',
    }));

  // Duplicate lead rows per contact (report-only).
  const { data: allLeads, error: allError } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, status, deal_type, contact_id, created_at')
    .eq('account_id', ACCOUNT_ID)
    .not('status', 'in', '("Lost")')
    .not('contact_id', 'is', null)
    .order('created_at', { ascending: true });
  if (allError) throw allError;

  const byContact = new Map<string, any[]>();
  for (const l of allLeads || []) {
    const arr = byContact.get(l.contact_id) || [];
    arr.push(l);
    byContact.set(l.contact_id, arr);
  }
  const duplicates: any[] = [];
  for (const [contactId, rows] of byContact.entries()) {
    if (rows.length > 1) {
      duplicates.push({
        contact_id: contactId,
        name: (rows[0].first_name + ' ' + rows[0].last_name).trim(),
        email: rows[0].email || null,
        leads: rows.map((r: any) => ({
          lead_id: r.id,
          status: r.status,
          deal_type: r.deal_type || null,
          created_at: r.created_at,
        })),
      });
    }
  }

  return { toConvert, duplicates, openLeadCount: leads.length };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const supabase = db();
    const { toConvert, duplicates, openLeadCount } = await computeReport(supabase);
    return NextResponse.json({
      ok: true,
      open_leads: openLeadCount,
      to_convert_count: toConvert.length,
      duplicate_groups: duplicates.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Report failed.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || (body.action !== 'report' && body.action !== 'convert')) {
      return NextResponse.json(
        { error: "Body must be { action: 'report' | 'convert' }." },
        { status: 400 }
      );
    }

    const supabase = db();
    const { toConvert, duplicates, openLeadCount } = await computeReport(supabase);

    if (body.action === 'report') {
      return NextResponse.json({
        action: 'report',
        open_leads: openLeadCount,
        to_convert: toConvert,
        duplicates,
      });
    }

    // convert
    let converted = 0;
    const failures: any[] = [];
    for (const item of toConvert) {
      const { error: updateError } = await supabase
        .from('leads')
        .update({ status: 'Client' })
        .eq('id', item.lead_id)
        .eq('account_id', ACCOUNT_ID);
      if (updateError) {
        failures.push({ lead_id: item.lead_id, error: updateError.message });
        continue;
      }
      await supabase.from('lead_activity').insert([
        {
          lead_id: item.lead_id,
          account_id: ACCOUNT_ID,
          user_id: null,
          type: 'auto_converted',
          metadata: { reason: item.reason, from: item.status, to: 'Client' },
        },
      ]);
      converted++;
    }

    return NextResponse.json({
      action: 'convert',
      converted,
      failures,
      duplicates,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Cleanup failed.' }, { status: 500 });
  }
}

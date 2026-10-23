/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/client-files/generate-listing — prepare a Form 271
// (Seller) or 272 (Landlord) Designated Representation Listing
// Agreement from the client file, using the shared offer engine
// (buildForm271/272).
//
// The prepared (unsigned) PDF is filed onto the client file's
// Representation Agreement checklist row — status stays 'pending'
// (prepared ≠ signed); when the executed copy comes back it replaces
// this copy as the copy of record (Tim's lifecycle rule, 2026-10-23).
//
// Auth: signed-in team member (session cookie).
// Body: { contact_id, client_file_id, kind: '371' | '372', answers?: {...} }

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { buildForm271, buildForm272, validateListing } from '@/lib/offerPdf';

const BUCKET = 'client-documents';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function partsFromISO(iso: string) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return { day: '', month: '', year: '' };
  return { day: String(d), month: MONTHS[m - 1] || '', year: String(y).slice(2) };
}

function isoPlusMonths(iso: string, months: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
    }

    const body = await req.json();
    const { contact_id, client_file_id } = body || {};
    const kind = body?.kind === '272' ? '272' : '271';
    const answers = body?.answers || {};
    if (!contact_id || !client_file_id) {
      return NextResponse.json(
        { ok: false, error: 'contact_id and client_file_id are required' },
        { status: 400 }
      );
    }

    const supabase = serviceClient();
    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contact_id)
      .single();
    if (contactErr || !contact) {
      return NextResponse.json({ ok: false, error: 'Contact not found' }, { status: 404 });
    }

    let fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    if (!fullName) {
      // Fall back to the client file's own names (a file can carry
      // names the contact record hasn't been given yet).
      const { data: cfRow } = await supabase
        .from('client_files')
        .select('client_names')
        .eq('id', client_file_id)
        .single();
      fullName = String(cfRow?.client_names || '').split(',')[0].trim();
    }
    const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const startISO = answers.term_start || todayISO;
    const endISO = answers.term_end || isoPlusMonths(startISO, 6);

    const { data: cfEarly } = await supabase
      .from('client_files')
      .select('property_address, financials')
      .eq('id', client_file_id)
      .single();

    const listing: Record<string, any> = {
      clients: Array.isArray(answers.clients) && answers.clients.length ? answers.clients : [fullName],
      property_address: answers.property_address ?? cfEarly?.property_address ?? undefined,
      designated_reps:
        Array.isArray(answers.designated_reps) && answers.designated_reps.length
          ? answers.designated_reps
          : [],
      term_start: { ...partsFromISO(startISO), time: answers.term_start_time || undefined },
      term_end: partsFromISO(endISO),
      price: answers.price ?? cfEarly?.financials?.price ?? undefined,
      price_words: answers.price_words || undefined,
      commission_total_pct: answers.commission_total_pct ?? '5',
      commission_total_other: answers.commission_total_other || undefined,
      commission_total: answers.commission_total || undefined,
      commission_coop_pct: answers.commission_coop_pct ?? '2.5',
      commission_coop_other: answers.commission_coop_other || undefined,
      commission_coop: answers.commission_coop || undefined,
      commission_purchase_pct: answers.commission_purchase_pct || undefined,
      commission_purchase_other: answers.commission_purchase_other || undefined,
      holdover_days: answers.holdover_days ?? '90',
      schedule_a_text: answers.schedule_a_text || undefined,
      brokerage_address: answers.brokerage_address || undefined,
      brokerage_phone: answers.brokerage_phone || undefined,
    };

    const deal = { listing };
    const missing = validateListing(deal, kind);
    if (missing && missing.length) {
      return NextResponse.json({ ok: false, missing }, { status: 400 });
    }

    const { data: tpl, error: tplErr } = await supabase.storage
      .from(BUCKET)
      .download(`system/offer-templates/form${kind}.pdf`);
    if (tplErr || !tpl) {
      return NextResponse.json(
        { ok: false, error: `Blank Form ${kind} template not found in storage.` },
        { status: 404 }
      );
    }
    const templateBytes = new Uint8Array(await tpl.arrayBuffer());
    const built =
      kind === '272' ? await buildForm272(deal, templateBytes) : await buildForm271(deal, templateBytes);

    const storagePath = `filled-forms/${contact_id}/listing-${kind}-${Date.now()}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, built.bytes, { contentType: 'application/pdf', upsert: true });
    if (uploadErr) {
      return NextResponse.json(
        { ok: false, error: 'Failed to store the prepared form: ' + uploadErr.message },
        { status: 500 }
      );
    }

    // File the prepared copy onto the file's rep-agreement row.
    const { data: cf } = await supabase
      .from('client_files')
      .select('checklist_types')
      .eq('id', client_file_id)
      .single();
    const primaryType = (cf?.checklist_types || [])[0] || null;
    const { data: rows } = await supabase
      .from('client_documents')
      .select('id, document, form, checklist_type, stage_index')
      .eq('client_file_id', client_file_id);
    const all: any[] = rows || [];
    const match =
      all.find((r: any) => (r.form || '').includes(kind)) ||
      all.find((r: any) => (r.document || '').toLowerCase().includes('representation agreement'));
    if (match) {
      await supabase
        .from('client_documents')
        .update({ file_url: storagePath, received_via: 'generated' })
        .eq('id', match.id);
    } else if (primaryType) {
      const siblings = all.filter((r: any) => r.checklist_type === primaryType);
      const lastStage = siblings.reduce((m: number, r: any) => Math.max(m, r.stage_index || 0), 0);
      await supabase.from('client_documents').insert({
        client_file_id,
        checklist_type: primaryType,
        stage_index: lastStage,
        document: kind === '272' ? 'Landlord Representation Agreement' : 'Seller Representation Agreement',
        form: `OREA Form ${kind}`,
        required: 'required',
        status: 'pending',
        file_url: storagePath,
        received_via: 'generated',
      });
    }

    return NextResponse.json({ ok: true, file_path: storagePath, pages: built.pages });
  } catch (err: any) {
    console.error('generate-listing error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to prepare the agreement' },
      { status: 500 }
    );
  }
}

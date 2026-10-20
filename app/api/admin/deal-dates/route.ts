// /api/admin/deal-dates — read deals and set closing dates (Rea only).
// Auth: Bearer REA_AGENT_SECRET.
// Closing dates live in the deal paperwork, not the CRM, so Tim asked
// Rea to scrub the paperwork and enter the dates found. This route is
// the narrow write path for that: closing_date is the ONLY writable
// field here — no other deal column can be touched through it.
// GET  -> { deals: [{ id, deal_type, status, closing_date,
//           property_id, address }] } for the FC account.
// POST { updates: [{ deal_id, closing_date }] }
//      -> verifies each deal belongs to the FC account, sets its
//         closing_date ('YYYY-MM-DD' or null), returns per-item
//         { deal_id, ok, closing_date } results.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function authorized(req: NextRequest): boolean {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  return !!token && token === process.env.REA_AGENT_SECRET;
}

function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.';
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const supabase = db();

    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, deal_type, status, closing_date, property_id')
      .eq('account_id', ACCOUNT_ID)
      .order('created_at', { ascending: false });
    if (dealsError) throw dealsError;

    const rows = deals || [];
    const propertyIds = [...new Set(rows.map((deal) => deal.property_id).filter(Boolean))];

    const addressById: Record<string, string> = {};
    if (propertyIds.length > 0) {
      const { data: properties, error: propertiesError } = await supabase
        .from('properties')
        .select('id, address')
        .in('id', propertyIds);
      if (propertiesError) throw propertiesError;
      for (const property of properties || []) {
        addressById[property.id] = property.address;
      }
    }

    return NextResponse.json({
      deals: rows.map((deal) => ({
        id: deal.id,
        deal_type: deal.deal_type,
        status: deal.status,
        closing_date: deal.closing_date,
        property_id: deal.property_id,
        address: addressById[deal.property_id] || null,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

type DealUpdateInput = {
  deal_id?: unknown;
  closing_date?: unknown;
};

type DealUpdateResult = {
  deal_id: string | null;
  ok: boolean;
  closing_date: string | null;
  error?: string;
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const body: { updates?: DealUpdateInput[] } = await req.json().catch(() => ({}));
    const updates = Array.isArray(body?.updates) ? body.updates : [];

    const supabase = db();
    const results: DealUpdateResult[] = [];

    for (const update of updates) {
      const dealId = typeof update?.deal_id === 'string' && update.deal_id.trim() !== ''
        ? update.deal_id
        : null;
      const rawDate = update?.closing_date;
      const closingDate = rawDate === null
        ? null
        : typeof rawDate === 'string' && DATE_PATTERN.test(rawDate)
          ? rawDate
          : undefined;

      if (!dealId) {
        results.push({ deal_id: null, ok: false, closing_date: null, error: 'Missing deal_id.' });
        continue;
      }
      if (closingDate === undefined) {
        results.push({
          deal_id: dealId,
          ok: false,
          closing_date: null,
          error: "closing_date must be 'YYYY-MM-DD' or null.",
        });
        continue;
      }

      // The deal must belong to the FC account before anything is written.
      const { data: existing, error: lookupError } = await supabase
        .from('deals')
        .select('id')
        .eq('id', dealId)
        .eq('account_id', ACCOUNT_ID)
        .maybeSingle();
      if (lookupError) {
        results.push({ deal_id: dealId, ok: false, closing_date: null, error: lookupError.message });
        continue;
      }
      if (!existing) {
        results.push({ deal_id: dealId, ok: false, closing_date: null, error: 'Deal not found in this account.' });
        continue;
      }

      const { data: updated, error: updateError } = await supabase
        .from('deals')
        .update({ closing_date: closingDate })
        .eq('id', dealId)
        .eq('account_id', ACCOUNT_ID)
        .select('id, closing_date')
        .single();
      if (updateError) {
        results.push({ deal_id: dealId, ok: false, closing_date: null, error: updateError.message });
        continue;
      }

      results.push({ deal_id: dealId, ok: true, closing_date: updated.closing_date });
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

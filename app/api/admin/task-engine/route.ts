/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/task-engine — deal-date auto-task engine.
// Auth: Bearer REA_AGENT_SECRET.
// POST { action: 'sync' } -> for every deal in the FC account with an
// active/firm status (Active / Sold Conditional / Sold Firm — never
// Closed) that carries a closing_date, make sure the closing milestone
// tasks exist:
//   closing - 7 days: "Closing in one week — {address}"
//   closing - 1 day:  "Closing tomorrow — {address}"        (priority high)
//   closing + 1 day:  "Send closing gift & thank-you — {address}"
//   closing + 7 days: "Post-close check-in call — {address}"
// Milestones are stored with source='auto_milestone' and deduped on
// (title, due_date) across ALL statuses, so re-running never duplicates
// and a completed milestone never resurrects. A milestone whose due
// date is more than 1 day in the past (Toronto) is skipped — no
// backfill spam; the +1/+7 post-close milestones for a just-closed
// deal still land because their due dates fall inside that window.
// Each task is assigned to the deal's agent (account owner as fallback)
// and linked to the deal's lead when the deal's contact has one.
//
// SCHEMA NOTE: no CRM code anywhere references date columns on the
// deals table (the deal create/edit screens carry only contact,
// property, agent, type, status). If closing_date does not exist, the
// deals query errors and this route reports
// closing_date_available: false instead of failing — the sync is then
// a clean no-op, and it starts working the moment the column exists.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';
const ACTIVE_DEAL_STATUSES = ['Active', 'Sold Conditional', 'Sold Firm'];

type DealRow = {
  id: string;
  contact_id: string | null;
  property_id: string | null;
  assigned_user_id: string | null;
  status: string;
  closing_date: string | null;
};

type Milestone = {
  offsetDays: number;
  titlePrefix: string;
  priority: string;
};

const MILESTONES: Milestone[] = [
  { offsetDays: -7, titlePrefix: 'Closing in one week', priority: 'medium' },
  { offsetDays: -1, titlePrefix: 'Closing tomorrow', priority: 'high' },
  { offsetDays: 1, titlePrefix: 'Send closing gift & thank-you', priority: 'medium' },
  { offsetDays: 7, titlePrefix: 'Post-close check-in call', priority: 'medium' },
];

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

// YYYY-MM-DD in America/Toronto for a given instant.
function torontoDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  let year = '';
  let month = '';
  let day = '';
  for (const p of parts) {
    if (p.type === 'year') year = p.value;
    if (p.type === 'month') month = p.value;
    if (p.type === 'day') day = p.value;
  }
  return year + '-' + month + '-' + day;
}

// Add days to a YYYY-MM-DD date (pure date math, UTC-anchored at noon).
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || body.action !== 'sync') {
      return NextResponse.json(
        { error: "Body must be { action: 'sync' }." },
        { status: 400 }
      );
    }

    const supabase = db();
    const todayStr = torontoDateString(new Date());
    const cutoffStr = addDays(todayStr, -1);

    // Deals probe: closing_date may not exist on the deals table.
    const { data: dealData, error: dealError } = await supabase
      .from('deals')
      .select('id, contact_id, property_id, assigned_user_id, status, closing_date')
      .eq('account_id', ACCOUNT_ID)
      .in('status', ACTIVE_DEAL_STATUSES);
    if (dealError) {
      return NextResponse.json({
        action: 'sync',
        created: 0,
        skipped_existing: 0,
        skipped_past: 0,
        deals_seen: 0,
        closing_date_available: false,
        note:
          'Deals query failed (' +
          dealError.message +
          '). The deals table most likely has no closing_date column; milestone sync is a no-op until one exists.',
      });
    }

    const dealRows = ((dealData || []) as DealRow[]).filter(function (d) {
      return !!d.closing_date;
    });
    const dealsSeen = dealRows.length;

    if (dealsSeen === 0) {
      return NextResponse.json({
        action: 'sync',
        created: 0,
        skipped_existing: 0,
        skipped_past: 0,
        deals_seen: 0,
        closing_date_available: true,
      });
    }

    // Account owner (assignment fallback).
    let ownerId: string | null = null;
    const { data: ownerRow } = await supabase
      .from('account_users')
      .select('user_id')
      .eq('account_id', ACCOUNT_ID)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    if (ownerRow && typeof ownerRow.user_id === 'string') {
      ownerId = ownerRow.user_id;
    }

    // Property addresses.
    const propertyIds: string[] = [];
    for (const d of dealRows) {
      if (d.property_id && propertyIds.indexOf(d.property_id) < 0) {
        propertyIds.push(d.property_id);
      }
    }
    const addressByProperty = new Map<string, string>();
    if (propertyIds.length > 0) {
      const { data: propertyRows, error: propertyError } = await supabase
        .from('properties')
        .select('id, address')
        .eq('account_id', ACCOUNT_ID)
        .in('id', propertyIds);
      if (propertyError) throw propertyError;
      for (const p of propertyRows || []) {
        addressByProperty.set(p.id, p.address);
      }
    }

    // Most recent lead per contact (the deal's linked lead).
    const contactIds: string[] = [];
    for (const d of dealRows) {
      if (d.contact_id && contactIds.indexOf(d.contact_id) < 0) {
        contactIds.push(d.contact_id);
      }
    }
    const leadByContact = new Map<string, string>();
    if (contactIds.length > 0) {
      const { data: leadRows, error: leadError } = await supabase
        .from('leads')
        .select('id, contact_id, created_at')
        .eq('account_id', ACCOUNT_ID)
        .in('contact_id', contactIds)
        .order('created_at', { ascending: false });
      if (leadError) throw leadError;
      for (const l of leadRows || []) {
        if (l.contact_id && !leadByContact.has(l.contact_id)) {
          leadByContact.set(l.contact_id, l.id);
        }
      }
    }

    // Existing milestone tasks — the dedupe set (any status).
    const { data: existingRows, error: existingError } = await supabase
      .from('tasks')
      .select('title, due_date')
      .eq('account_id', ACCOUNT_ID)
      .eq('source', 'auto_milestone');
    if (existingError) throw existingError;
    const existingKeys = new Set<string>();
    for (const t of existingRows || []) {
      existingKeys.add(t.title + '|' + String(t.due_date || '').slice(0, 10));
    }

    let skippedExisting = 0;
    let skippedPast = 0;
    const toInsert: any[] = [];

    for (const deal of dealRows) {
      const closing = String(deal.closing_date).slice(0, 10);
      const address =
        (deal.property_id && addressByProperty.get(deal.property_id)) ||
        'Address not set';
      const assignee = deal.assigned_user_id || ownerId;
      const leadId = deal.contact_id
        ? leadByContact.get(deal.contact_id) || null
        : null;

      for (const m of MILESTONES) {
        const due = addDays(closing, m.offsetDays);
        const title = m.titlePrefix + ' — ' + address;
        const key = title + '|' + due;
        if (existingKeys.has(key)) {
          skippedExisting++;
          continue;
        }
        if (due < cutoffStr) {
          skippedPast++;
          continue;
        }
        existingKeys.add(key);
        toInsert.push({
          account_id: ACCOUNT_ID,
          title,
          due_date: due,
          priority: m.priority,
          status: 'pending',
          assigned_user_id: assignee,
          lead_id: leadId,
          source: 'auto_milestone',
          created_by: assignee,
        });
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from('tasks').insert(toInsert);
      if (insertError) throw insertError;
    }

    return NextResponse.json({
      action: 'sync',
      created: toInsert.length,
      skipped_existing: skippedExisting,
      skipped_past: skippedPast,
      deals_seen: dealsSeen,
      closing_date_available: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Sync failed.' },
      { status: 500 }
    );
  }
}

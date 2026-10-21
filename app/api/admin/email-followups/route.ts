/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/email-followups — sync endpoint behind the dashboard's
// Email Follow-ups card.
// Auth: Bearer REA_AGENT_SECRET.
// The hourly inbox scanner (Rea) reads the owner's unreplied inbox mail
// and syncs it here; the dashboard card reads the table directly and
// lets the owner dismiss rows (status='dismissed'). Dismissed rows are
// NEVER resurrected by later syncs — the scanner keeps sending them in
// open_items and this route skips them.
// GET  -> { open: [...rows], dismissed_ids: [...] } for the FC account.
// POST { open_items: [{ message_id, sender_name, sender_email, subject,
//          snippet, received_at }], resolved_ids: [message_id, ...] }
//      -> upserts open_items as status='open' (skipping dismissed ids),
//         marks resolved_ids 'resolved' where currently 'open',
//         returns counts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

const ROW_COLUMNS =
  'id, account_id, message_id, sender_name, sender_email, subject, snippet, received_at, status, first_seen_at, last_seen_at';

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

function cleanString(value: any): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const supabase = db();

    const { data: open, error: openError } = await supabase
      .from('email_followups')
      .select(ROW_COLUMNS)
      .eq('account_id', ACCOUNT_ID)
      .eq('status', 'open')
      .order('received_at', { ascending: true });
    if (openError) throw openError;

    const { data: dismissed, error: dismissedError } = await supabase
      .from('email_followups')
      .select('message_id')
      .eq('account_id', ACCOUNT_ID)
      .eq('status', 'dismissed');
    if (dismissedError) throw dismissedError;

    return NextResponse.json({
      open: open || [],
      dismissed_ids: (dismissed || []).map((row: any) => row.message_id),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Fetch failed.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const rawOpenItems = Array.isArray(body?.open_items) ? body.open_items : [];
    const resolvedIds: string[] = (Array.isArray(body?.resolved_ids) ? body.resolved_ids : [])
      .filter((id: any) => typeof id === 'string' && id.trim() !== '');

    const supabase = db();
    const nowIso = new Date().toISOString();

    // Which of the incoming message_ids are dismissed? Those are skipped
    // entirely — a dismissal is the owner's final word on that email.
    const incomingIds = rawOpenItems
      .map((item: any) => cleanString(item?.message_id))
      .filter((id: string | null): id is string => !!id);

    const dismissedSet = new Set<string>();
    if (incomingIds.length > 0) {
      const { data: dismissedRows, error: dismissedError } = await supabase
        .from('email_followups')
        .select('message_id')
        .eq('account_id', ACCOUNT_ID)
        .eq('status', 'dismissed')
        .in('message_id', incomingIds);
      if (dismissedError) throw dismissedError;
      for (const row of dismissedRows || []) {
        dismissedSet.add(row.message_id);
      }
    }

    const upsertRows: any[] = [];
    let skippedDismissed = 0;
    for (const item of rawOpenItems) {
      const messageId = cleanString(item?.message_id);
      if (!messageId) continue;
      if (dismissedSet.has(messageId)) {
        skippedDismissed++;
        continue;
      }
      upsertRows.push({
        account_id: ACCOUNT_ID,
        message_id: messageId,
        sender_name: cleanString(item?.sender_name),
        sender_email: cleanString(item?.sender_email),
        subject: cleanString(item?.subject),
        snippet: cleanString(item?.snippet),
        received_at: cleanString(item?.received_at),
        status: 'open',
        last_seen_at: nowIso,
      });
    }

    // Dedupe-safe sync (fixed 2026-10-21): plain upserts created duplicate
    // open rows for the same message_id, so this route now collapses any
    // existing duplicate open rows (keeping the earliest first_seen), then
    // UPDATEs the surviving row when one exists and INSERTs only when the
    // message has no open row yet.
    let deduped = 0;
    let written = 0;
    if (upsertRows.length > 0) {
      const syncIds = upsertRows.map((row: any) => row.message_id as string);
      const { data: existingRows, error: existingError } = await supabase
        .from('email_followups')
        .select('id, message_id, status, first_seen_at')
        .eq('account_id', ACCOUNT_ID)
        .in('message_id', syncIds)
        .order('first_seen_at', { ascending: true });
      if (existingError) throw existingError;

      const openByMessage = new Map<string, string>();
      const extraOpenIds: string[] = [];
      for (const row of existingRows || []) {
        if (row.status !== 'open') continue;
        if (openByMessage.has(row.message_id)) extraOpenIds.push(row.id);
        else openByMessage.set(row.message_id, row.id);
      }
      if (extraOpenIds.length > 0) {
        const { error: dedupeError } = await supabase
          .from('email_followups')
          .delete()
          .in('id', extraOpenIds);
        if (dedupeError) throw dedupeError;
        deduped = extraOpenIds.length;
      }

      for (const row of upsertRows) {
        const keeperId = openByMessage.get(row.message_id);
        if (keeperId) {
          const { error: updateError } = await supabase
            .from('email_followups')
            .update({
              sender_name: row.sender_name,
              sender_email: row.sender_email,
              subject: row.subject,
              snippet: row.snippet,
              received_at: row.received_at,
              last_seen_at: nowIso,
            })
            .eq('id', keeperId);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from('email_followups')
            .insert({ ...row, first_seen_at: nowIso });
          if (insertError) throw insertError;
        }
        written++;
      }
    }

    let resolvedCount = 0;
    if (resolvedIds.length > 0) {
      const { data: resolvedRows, error: resolvedError } = await supabase
        .from('email_followups')
        .update({ status: 'resolved', last_seen_at: nowIso })
        .eq('account_id', ACCOUNT_ID)
        .eq('status', 'open')
        .in('message_id', resolvedIds)
        .select('id');
      if (resolvedError) throw resolvedError;
      resolvedCount = (resolvedRows || []).length;
    }

    return NextResponse.json({
      upserted: written,
      deduped,
      skipped_dismissed: skippedDismissed,
      resolved: resolvedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Sync failed.' }, { status: 500 });
  }
}

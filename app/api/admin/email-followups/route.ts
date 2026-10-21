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

    // Identity matching (fixed 2026-10-21): Outlook hands the scanner the
    // same email under two different message-id formats (a 120-char and a
    // 152-char form), and exact-id matching let both live as separate open
    // rows — the dashboard showed the REMAX dues email twice. An incoming
    // item now matches an existing row when the message_id matches OR the
    // (sender_email, subject, received_at) triple matches. Matches collapse
    // to one keeper row (extras deleted), a dismissal on ANY matching row
    // skips the item (dismissals are final), and the keeper adopts the
    // incoming message_id.
    const { data: allRows, error: allRowsError } = await supabase
      .from('email_followups')
      .select(
        'id, message_id, sender_email, subject, received_at, status, first_seen_at'
      )
      .eq('account_id', ACCOUNT_ID)
      .in('status', ['open', 'dismissed'])
      .order('first_seen_at', { ascending: true });
    if (allRowsError) throw allRowsError;
    const existing: any[] = allRows || [];

    const tripleOf = (
      sender: string | null,
      subject: string | null,
      received: string | null
    ) =>
      (sender || '').toLowerCase() +
      '|' +
      (subject || '') +
      '|' +
      (received || '');

    let skippedDismissed = 0;
    let deduped = 0;
    let written = 0;

    for (const item of rawOpenItems) {
      const messageId = cleanString(item?.message_id);
      if (!messageId) continue;
      const senderEmail = cleanString(item?.sender_email);
      const subject = cleanString(item?.subject);
      const receivedAt = cleanString(item?.received_at);
      const triple = tripleOf(senderEmail, subject, receivedAt);

      const matches = existing.filter(
        (row: any) =>
          row.message_id === messageId ||
          tripleOf(row.sender_email, row.subject, row.received_at) === triple
      );
      if (matches.some((row: any) => row.status === 'dismissed')) {
        skippedDismissed++;
        continue;
      }
      const openMatches = matches.filter((row: any) => row.status === 'open');
      const keeper =
        openMatches.find((row: any) => row.message_id === messageId) ||
        openMatches[0];

      if (keeper) {
        const extras = openMatches.filter((row: any) => row.id !== keeper.id);
        if (extras.length > 0) {
          const { error: dedupeError } = await supabase
            .from('email_followups')
            .delete()
            .in(
              'id',
              extras.map((row: any) => row.id)
            );
          if (dedupeError) throw dedupeError;
          deduped += extras.length;
          for (const ex of extras) {
            const idx = existing.indexOf(ex);
            if (idx >= 0) existing.splice(idx, 1);
          }
        }
        const { error: updateError } = await supabase
          .from('email_followups')
          .update({
            message_id: messageId,
            sender_name: cleanString(item?.sender_name),
            sender_email: senderEmail,
            subject,
            snippet: cleanString(item?.snippet),
            received_at: receivedAt,
            last_seen_at: nowIso,
          })
          .eq('id', keeper.id);
        if (updateError) throw updateError;
        keeper.message_id = messageId;
      } else {
        const { error: insertError } = await supabase
          .from('email_followups')
          .insert({
            account_id: ACCOUNT_ID,
            message_id: messageId,
            sender_name: cleanString(item?.sender_name),
            sender_email: senderEmail,
            subject,
            snippet: cleanString(item?.snippet),
            received_at: receivedAt,
            status: 'open',
            first_seen_at: nowIso,
            last_seen_at: nowIso,
          });
        if (insertError) throw insertError;
        existing.push({
          id: 'new-' + messageId,
          message_id: messageId,
          sender_email: senderEmail,
          subject,
          received_at: receivedAt,
          status: 'open',
          first_seen_at: nowIso,
        });
      }
      written++;
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

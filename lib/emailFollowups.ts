/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared per-user sync for the email_followups table (the data behind
// the dashboard's Email Follow-ups card).
//
// One sync = one mailbox owner (userId). Callers:
//  - /api/admin/email-followups (the external inbox scanner syncs Tim's
//    rows there; items without an explicit user_id default to the
//    account owner before reaching this helper).
//  - /api/email/scan-followups (the CRM-side Graph scanner syncs every
//    other connected user's rows here directly).
//
// Identity matching (fixed 2026-10-21, preserved verbatim): Outlook
// hands scanners the same email under two different message-id formats
// (a 120-char and a 152-char form), and exact-id matching let both live
// as separate open rows — the dashboard showed the REMAX dues email
// twice. An incoming item now matches an existing row OF THE SAME USER
// when the message_id matches OR the (sender_email, subject,
// received_at) triple matches. Matches collapse to one keeper row
// (extras deleted), a dismissal on ANY matching row skips the item
// (dismissals are final), and the keeper adopts the incoming
// message_id. The user scoping matters: two team members can receive
// the same email, and each keeps their own row.

import type { SupabaseClient } from '@supabase/supabase-js';

function cleanString(value: any): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export interface FollowupSyncCounts {
  upserted: number;
  deduped: number;
  skipped_dismissed: number;
  resolved: number;
}

export async function syncFollowupsForUser(
  supabase: SupabaseClient,
  accountId: string,
  userId: string,
  rawOpenItems: any[],
  resolvedIds: string[]
): Promise<FollowupSyncCounts> {
  const nowIso = new Date().toISOString();

  const { data: allRows, error: allRowsError } = await supabase
    .from('email_followups')
    .select(
      'id, message_id, sender_email, subject, received_at, status, first_seen_at'
    )
    .eq('account_id', accountId)
    .eq('user_id', userId)
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
      // The insert must return the row's real uuid: the in-memory
      // `existing` list feeds id-based updates/deletes later in this
      // same sync (keeper update, dedupe delete), and a stand-in id
      // built from the message_id reaches the uuid `id` column and
      // throws "invalid input syntax for type uuid", aborting the
      // sync after the inserts have already committed (2026-11-03:
      // 511 rows written for one user, resolution never ran).
      const { data: inserted, error: insertError } = await supabase
        .from('email_followups')
        .insert({
          account_id: accountId,
          user_id: userId,
          message_id: messageId,
          sender_name: cleanString(item?.sender_name),
          sender_email: senderEmail,
          subject,
          snippet: cleanString(item?.snippet),
          received_at: receivedAt,
          status: 'open',
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        })
        .select('id')
        .single();
      if (insertError) throw insertError;
      existing.push({
        id: inserted.id,
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
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .eq('status', 'open')
      .in('message_id', resolvedIds)
      .select('id');
    if (resolvedError) throw resolvedError;
    resolvedCount = (resolvedRows || []).length;
  }

  return {
    upserted: written,
    deduped,
    skipped_dismissed: skippedDismissed,
    resolved: resolvedCount,
  };
}

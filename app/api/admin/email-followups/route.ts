/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/email-followups — sync endpoint behind the dashboard's
// Email Follow-ups card.
// Auth: Bearer REA_AGENT_SECRET.
// The external inbox scanner (Rea) reads the owner's unreplied inbox
// mail and syncs it here; the dashboard card reads the table directly
// and lets each user dismiss their own rows (status='dismissed').
// Dismissed rows are NEVER resurrected by later syncs — the scanner
// keeps sending them in open_items and this route skips them.
//
// Per-user rows (2026-11-02): every row belongs to a mailbox owner
// (user_id). POST items may carry user_id; items WITHOUT one default
// to the account owner — that is what keeps the external scanner's
// existing payloads (which know nothing about user_id) landing as
// Tim's rows. Upserts match within the item's user only (message_id +
// user_id identity; see lib/emailFollowups.ts), so two team members
// who received the same email each keep their own row. resolved_ids
// apply to the body's user_id when given, else to the owner.
// GET  -> { open: [...rows incl. user_id], dismissed_ids: [...] } for
//         the FC account (unchanged shape; callers scope by user_id).
// POST { open_items: [{ message_id, sender_name, sender_email, subject,
//          snippet, received_at, user_id? }], resolved_ids: [...],
//          user_id? }
//      -> per-user upserts + resolves, returns summed counts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncFollowupsForUser } from '@/lib/emailFollowups';

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

const ROW_COLUMNS =
  'id, account_id, user_id, message_id, sender_name, sender_email, subject, snippet, received_at, status, first_seen_at, last_seen_at';

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

// The account owner's user id — the default mailbox owner for any sync
// payload that does not name a user (the external scanner syncs the
// owner's inbox only). Resolved lazily and only when actually needed,
// so a payload where every item carries user_id and no resolved_ids
// are present never depends on this lookup.
async function ownerUserId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('account_users')
    .select('user_id')
    .eq('account_id', ACCOUNT_ID)
    .eq('role', 'owner')
    .maybeSingle();
  if (error) throw error;
  if (!data?.user_id) throw new Error('Account owner not found.');
  return data.user_id as string;
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

    // Group open items by their mailbox owner. An item's own user_id
    // wins; the body's top-level user_id is next; the account owner is
    // the fallback (the external scanner's payloads land as the
    // owner's rows, exactly as before per-user rows existed).
    const bodyUserId = cleanString(body?.user_id);
    const itemsByUser = new Map<string, any[]>();
    let ownerId: string | null = null;
    for (const item of rawOpenItems) {
      let itemUserId = cleanString(item?.user_id) || bodyUserId;
      if (!itemUserId) {
        if (!ownerId) ownerId = await ownerUserId(supabase);
        itemUserId = ownerId;
      }
      const group = itemsByUser.get(itemUserId) || [];
      group.push(item);
      itemsByUser.set(itemUserId, group);
    }

    // resolved_ids belong to one user's sync: the body's user_id when
    // given, otherwise the owner's (the external scanner resolves the
    // owner's rows only).
    let resolvedUserId: string | null = null;
    if (resolvedIds.length > 0) {
      resolvedUserId = bodyUserId;
      if (!resolvedUserId) {
        if (!ownerId) ownerId = await ownerUserId(supabase);
        resolvedUserId = ownerId;
      }
    }

    const totals = { upserted: 0, deduped: 0, skipped_dismissed: 0, resolved: 0 };
    const userIds = new Set<string>(itemsByUser.keys());
    if (resolvedUserId) userIds.add(resolvedUserId);
    for (const userId of Array.from(userIds)) {
      const counts = await syncFollowupsForUser(
        supabase,
        ACCOUNT_ID,
        userId,
        itemsByUser.get(userId) || [],
        userId === resolvedUserId ? resolvedIds : []
      );
      totals.upserted += counts.upserted;
      totals.deduped += counts.deduped;
      totals.skipped_dismissed += counts.skipped_dismissed;
      totals.resolved += counts.resolved;
    }

    return NextResponse.json(totals);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Sync failed.' }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/email/scan-followups — CRM-side Email Follow-ups scanner.
// Auth: Bearer REA_AGENT_SECRET (same as the other /api/admin routes;
// the daily 09:00 agent job calls this after its own sync).
//
// For every account member with a connected Microsoft (Outlook)
// mailbox in user_mail_connections, this reads their MAIN INBOX via
// Microsoft Graph and writes their email_followups rows with the same
// rule the owner's external scanner uses: a message is an open
// follow-up when it sits in the inbox, arrived more than 24 hours ago,
// and the user has not replied (checked by conversationId against
// their Sent Items). Messages gone from the inbox, or replied to
// since, are resolved. Dismissals are final (the shared sync in
// lib/emailFollowups.ts skips dismissed matches).
//
// ANTI-DUPLICATION RULE: the account OWNER is deliberately excluded.
// The owner's (Tim's) rows keep coming from the long-standing external
// 09:00 scan of his inbox via the outlook-mail connector — if this
// scanner also wrote his rows, the two sources would fight over the
// same follow-ups (different message-id formats, constant churn).
// Everyone else's mailbox has no external scan, so theirs is written
// here. Unconnected members are skipped silently; when a member
// connects Outlook (e.g. Beth), the next run covers them with no code
// change. One user's failure never aborts the others. The response
// carries per-user COUNTS ONLY — never message content.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { msRefreshTokens } from '@/lib/microsoft';
import { syncFollowupsForUser } from '@/lib/emailFollowups';

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const INBOX_PAGE_CAP = 20; // 20 x 100 = up to 2,000 inbox messages
const SENT_PAGE_CAP = 10; // 10 x 200 = up to 2,000 sent messages

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

// The stored access token while comfortably valid; otherwise a
// refresh, persisted exactly the way lib/outlookSend.ts persists it
// (rotated refresh token kept, expiry + updated_at stamped) so a scan
// never strands the connection.
async function accessTokenFor(supabase: SupabaseClient, conn: any): Promise<string> {
  const expiresAt = conn.access_expires_at
    ? new Date(conn.access_expires_at).getTime()
    : 0;
  if (conn.access_token && expiresAt > Date.now() + 120_000) {
    return conn.access_token as string;
  }
  const tokens = await msRefreshTokens(conn.refresh_token);
  await supabase
    .from('user_mail_connections')
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken || conn.refresh_token,
      access_expires_at: tokens.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conn.id);
  return tokens.accessToken;
}

async function graphGet(accessToken: string, url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Microsoft Graph request failed: ${res.status} ${data?.error?.message || ''}`.trim()
    );
  }
  return data;
}

// Follow @odata.nextLink up to maxPages. `complete` is false when the
// cap stopped the walk — callers must not treat "not seen" as "gone"
// for a truncated scan.
async function graphPageAll(
  accessToken: string,
  firstUrl: string,
  maxPages: number
): Promise<{ items: any[]; complete: boolean }> {
  const items: any[] = [];
  let url: string | null = firstUrl;
  let pages = 0;
  while (url && pages < maxPages) {
    const data = await graphGet(accessToken, url);
    for (const value of data.value || []) items.push(value);
    url = data['@odata.nextLink'] || null;
    pages++;
  }
  return { items, complete: !url };
}

interface UserScanResult {
  user_id: string;
  email: string;
  scanned?: number;
  candidates?: number;
  upserted?: number;
  deduped?: number;
  skipped_dismissed?: number;
  resolved?: number;
  error?: string;
}

async function scanUser(
  supabase: SupabaseClient,
  userId: string,
  conn: any
): Promise<UserScanResult> {
  const email = (conn.email as string) || '';
  const accessToken = await accessTokenFor(supabase, conn);

  const inboxUrl =
    `${GRAPH}/me/mailFolders/inbox/messages` +
    `?$select=id,conversationId,subject,bodyPreview,receivedDateTime,from` +
    `&$orderby=receivedDateTime%20desc&$top=100`;
  const inbox = await graphPageAll(accessToken, inboxUrl, INBOX_PAGE_CAP);

  const sentUrl =
    `${GRAPH}/me/mailFolders/sentitems/messages?$select=conversationId&$top=200`;
  const sent = await graphPageAll(accessToken, sentUrl, SENT_PAGE_CAP);
  const repliedConversations = new Set<string>();
  for (const msg of sent.items) {
    if (msg.conversationId) repliedConversations.add(msg.conversationId);
  }

  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
  const ownEmail = email.toLowerCase();
  const inboxIds = new Set<string>();
  const candidates: any[] = [];
  const candidateIds = new Set<string>();

  for (const msg of inbox.items) {
    if (msg.id) inboxIds.add(msg.id);
    const receivedMs = msg.receivedDateTime
      ? new Date(msg.receivedDateTime).getTime()
      : NaN;
    if (!msg.id || !(receivedMs < cutoffMs)) continue; // too new (or undated)
    if (msg.conversationId && repliedConversations.has(msg.conversationId)) {
      continue; // the user has replied in this thread
    }
    const senderEmail = (
      msg.from?.emailAddress?.address || ''
    ).toLowerCase();
    if (!senderEmail) continue;
    if (senderEmail === ownEmail) continue; // mail from themselves
    if (senderEmail.endsWith('@thefcgroup.ca')) continue; // team-internal
    candidates.push({
      message_id: msg.id,
      sender_name: msg.from?.emailAddress?.name || null,
      sender_email: msg.from?.emailAddress?.address || null,
      subject: msg.subject || null,
      snippet: (msg.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 140) || null,
      received_at: msg.receivedDateTime || null,
    });
    candidateIds.add(msg.id);
  }

  // Resolve this user's currently-open rows that no longer qualify:
  // still visible in the inbox but no longer a candidate (they replied
  // since the row opened), or — only when the inbox walk was complete —
  // gone from the inbox entirely (filed/deleted = dealt with).
  const { data: openRows, error: openError } = await supabase
    .from('email_followups')
    .select('message_id')
    .eq('account_id', ACCOUNT_ID)
    .eq('user_id', userId)
    .eq('status', 'open');
  if (openError) throw openError;

  const resolvedIds: string[] = [];
  for (const row of openRows || []) {
    const mid = row.message_id as string;
    if (candidateIds.has(mid)) continue;
    if (inboxIds.has(mid) || inbox.complete) resolvedIds.push(mid);
  }

  const counts = await syncFollowupsForUser(
    supabase,
    ACCOUNT_ID,
    userId,
    candidates,
    resolvedIds
  );

  return {
    user_id: userId,
    email,
    scanned: inbox.items.length,
    candidates: candidates.length,
    ...counts,
  };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const supabase = db();

    const { data: members, error: membersError } = await supabase
      .from('account_users')
      .select('user_id, role')
      .eq('account_id', ACCOUNT_ID);
    if (membersError) throw membersError;

    const ownerId = (members || []).find((m: any) => m.role === 'owner')?.user_id;

    const users: UserScanResult[] = [];
    let skippedUnconnected = 0;

    for (const member of members || []) {
      const userId = member.user_id as string;
      // Anti-duplication: the owner's rows come from the external scan.
      if (userId === ownerId) continue;

      const { data: conn } = await supabase
        .from('user_mail_connections')
        .select(
          'id, email, refresh_token, access_token, access_expires_at, status'
        )
        .eq('user_id', userId)
        .eq('provider', 'microsoft')
        .maybeSingle();
      if (!conn || conn.status !== 'connected' || !conn.refresh_token) {
        skippedUnconnected++;
        continue;
      }

      try {
        users.push(await scanUser(supabase, userId, conn));
      } catch (err: any) {
        users.push({
          user_id: userId,
          email: (conn.email as string) || '',
          error: err.message || 'Scan failed.',
        });
      }
    }

    return NextResponse.json({ ok: true, users, skipped_unconnected: skippedUnconnected });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Scan failed.' }, { status: 500 });
  }
}

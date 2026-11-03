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

// ---------------------------------------------------------------------
// Automated-mail filter — applies to ALL users (Tim, 2026-11-03:
// "keep these rules for all of us, not just him").
//
// The follow-ups rule (sits in the main inbox, >24h old, unreplied)
// counts anything still sitting in an inbox. That works for a tidy
// inbox, but a mailbox that keeps system mail drowns the card in
// notifications that will never need a reply: Aidan's first week
// produced 98 open rows, ~90% automated (REALM saved-search alerts,
// BrokerBay showing notices, bank alerts, marketing). This filter
// keeps the card to mail from actual people: items from automated
// senders never become follow-ups. Both sync paths use it because
// both funnel through syncFollowupsForUser below (the admin route for
// the owner's external scan, the CRM scanner for everyone else).
//
// CONSERVATIVE BY DESIGN: when in doubt, KEEP the email. The checks
// are exact domains, exact addresses, and no-reply-style local parts
// — never a display name alone, never whole consumer domains
// (gmail.com, outlook.com, ...), and never a domain that also carries
// real human mail: remaxhallmark.com is NOT blocked (deals@ there is
// real deal-processing mail), and crea.ca is not blocked either (only
// its comms address is). A sender not listed here is treated as a
// person. To block more automated mail, extend these constants.

// Domains that only ever send automated mail.
const AUTOMATED_SENDER_DOMAINS: ReadonlySet<string> = new Set([
  'em.realmmlp.ca', // REALM saved-search alerts / activity notices
  'mg.brokerbay.com', // BrokerBay system notices (see relay rule below)
  'mg2.brokerbay.com', // BrokerBay system notices (see relay rule below)
  'payments.interac.ca', // Interac e-Transfer notices
  'authentisign.com', // Authentisign signing-status pings
  'reablehub.com', // REable Hub post-ready / marketing notices
  'vistaprintcorporate.com', // VistaPrint marketing
  'easy.staples.ca', // Staples marketing
  'eg.expedia.com', // Expedia marketing
  'mail.trreb.ca', // TRREB membership comms
]);

// BrokerBay is a relay as well as a notifier: most of its mail is a
// system notice wearing a system label ("Showings - <brokerage>",
// "Offer Updates", "BrokerBay", "Price Change Update"), but a message
// FROM a person can arrive through it wearing that person's name
// (2026-11-03: "JEFF D'ALTROY" about a property, amid 22 system
// notices). For the two BrokerBay domains only, a plain person's
// display name rescues the message; every other blocked domain stays
// blocked regardless of name.
const BROKERBAY_RELAY_DOMAINS: ReadonlySet<string> = new Set([
  'mg.brokerbay.com',
  'mg2.brokerbay.com',
]);

// Words that mark a display name as a system label rather than a
// person ("Showings - X", "Offer Updates", "Price Change Update").
const SYSTEM_LABEL_WORDS: readonly string[] = [
  'showing',
  'offer',
  'update',
  'brokerbay',
  'notification',
  'reminder',
  'listing',
  'feedback',
  'price change',
  'duplicate',
  'alert',
];

function looksLikePlainPersonName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (n.includes(' - ')) return false; // "Showings - <brokerage>" labels
  for (const word of SYSTEM_LABEL_WORDS) {
    if (n.includes(word)) return false;
  }
  return true;
}

// Exact addresses that send only automated mail even though their
// domain also carries real mail.
const AUTOMATED_SENDER_ADDRESSES: ReadonlySet<string> = new Set([
  'crea-comms@crea.ca', // CREA comms/dues (crea.ca itself carries people)
  'mario@homelifekingsview.com', // marketing blasts from a person's address
]);

// Local parts (the part before @) that mark an address as automated
// on ANY domain: the exact local part, the pattern followed by a
// separator ("noreply-acct@"), or — for single-word patterns — the
// pattern as one separator-delimited segment ("mailbox.noreply@").
const AUTOMATED_LOCAL_PARTS: readonly string[] = [
  'no-reply',
  'noreply',
  'do-not-reply',
  'donotreply',
  'notifications',
  'notification',
  'mailer-daemon',
  'postmaster',
];

function localPartIsAutomated(local: string): boolean {
  const segments = local.split(/[-._+]/);
  for (const pattern of AUTOMATED_LOCAL_PARTS) {
    if (local === pattern) return true;
    if (
      local.startsWith(pattern + '-') ||
      local.startsWith(pattern + '.') ||
      local.startsWith(pattern + '_') ||
      local.startsWith(pattern + '+')
    ) {
      return true;
    }
    if (!pattern.includes('-') && segments.includes(pattern)) return true;
  }
  return false;
}

// True when the sender is automated mail that should never become an
// email follow-up. The display name is used ONLY for the BrokerBay
// relay rescue above — never to block anyone by name alone.
export function isAutomatedSender(
  senderEmail: string | null | undefined,
  senderName?: string | null | undefined
): boolean {
  const email = (senderEmail || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0) return false; // no usable address — treat as a person
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (AUTOMATED_SENDER_ADDRESSES.has(email)) return true;
  if (AUTOMATED_SENDER_DOMAINS.has(domain)) {
    if (
      BROKERBAY_RELAY_DOMAINS.has(domain) &&
      looksLikePlainPersonName(senderName)
    ) {
      return false; // a person's message relayed through BrokerBay
    }
    return true;
  }
  return localPartIsAutomated(local);
}

// The mailbox owner's own connected addresses (lowercased), so mail
// from themselves never becomes their own follow-up. Best-effort: a
// failed lookup returns an empty set and the sync proceeds without
// the self-skip rather than failing.
async function ownMailboxEmails(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const emails = new Set<string>();
  const { data, error } = await supabase
    .from('user_mail_connections')
    .select('email')
    .eq('user_id', userId)
    .eq('provider', 'microsoft')
    .eq('status', 'connected');
  if (error || !data) return emails;
  for (const row of data) {
    const email = (row as any)?.email;
    if (typeof email === 'string' && email.trim() !== '') {
      emails.add(email.trim().toLowerCase());
    }
  }
  return emails;
}

function cleanString(value: any): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export interface FollowupSyncCounts {
  upserted: number;
  deduped: number;
  skipped_dismissed: number;
  skipped_automated: number;
  skipped_self: number;
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

  // Automated-mail filter + self-mail skip, applied to every sync
  // for every user before any matching: automated senders never
  // become follow-ups, and neither does mail from the mailbox owner
  // themselves. (The CRM scanner also filters upstream; this is the
  // shared enforcement point both routes pass through.)
  const ownEmails = await ownMailboxEmails(supabase, userId);
  let skippedAutomated = 0;
  let skippedSelf = 0;
  const openItems: any[] = [];
  for (const item of rawOpenItems) {
    const senderLc = (cleanString(item?.sender_email) || '').toLowerCase();
    if (senderLc && ownEmails.has(senderLc)) {
      skippedSelf++;
      continue;
    }
    if (isAutomatedSender(item?.sender_email, item?.sender_name)) {
      skippedAutomated++;
      continue;
    }
    openItems.push(item);
  }

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

  for (const item of openItems) {
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
    skipped_automated: skippedAutomated,
    skipped_self: skippedSelf,
    resolved: resolvedCount,
  };
}

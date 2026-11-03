/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/resend-suppression-sweep — sweeps Resend's dead addresses
// into the CRM (Tim, 2026-11-03). The Resend webhook flags contacts on
// NEW events (and now clears + notes them too), but historical
// suppressions/bounces were never swept in; this route is the catch-up
// and is safe to re-run.
//
// Sources (Resend API, server-side RESEND_API_KEY):
//  1. GET /suppressions — the team suppression list (limit=100, `after`
//     cursor). An address lands there by complaint, by manual add, or
//     automatically after a bounce (origin tells which). Bounce-origin
//     entries are the API's hard/permanent bounce set: transient
//     (soft) bounces do not end in suppression, and the API exposes no
//     per-email bounce-type field anywhere else, so non-suppressed
//     bounced addresses are reported, never cleared.
//  2. GET /emails — scanned for recipients whose last_event is
//     'bounced'. Used ONLY as a cross-check: bounced recipients that
//     are neither suppressed nor in the caller's extra list are
//     returned under emails_scan.not_cleared, untouched.
//  3. extra_addresses in the POST body — addresses Tim verified in his
//     Resend dashboard: { email, category: 'bounced' | 'suppressed' }.
//     They clear even when the API list misses them (the dashboard is
//     authoritative); misses are reported in extras_not_found_in_api.
//
// Categories: an address is 'suppressed' when it is on the suppression
// list with a complaint/manual origin or Tim lists it as suppressed;
// 'bounced' when its suppression origin is 'bounce' or Tim lists it as
// bounced; both at once is possible and is reported as the overlap.
//
// For every matched contact (FC account, email match is
// case-insensitive): the stored email is CLEARED (set NULL — the
// contact row, name, phone and history all stay) and the webhook's
// email_invalid marking is mirrored for contacts not already flagged
// (complaint -> 'spam_complaint', bounced -> 'bounced', otherwise
// 'suppressed'; already-flagged contacts keep their original
// reason/timestamp). Every clear also writes a contact note —
// "Email cleared — address <bounced|suppressed|bounced/suppressed>
// (Resend, <Toronto date>)" — authored by the contact's assigned user
// (the notes table only accepts real users). Nothing is ever deleted.
//
// Auth: Bearer <secret>, same as the other /api/admin routes.
// Idempotent: cleared contacts no longer carry an email, so a re-run
// matches nothing new, clears 0 and writes no duplicate notes.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';
const RESEND_API_BASE = 'https://api.resend.com';
const MAX_SUPPRESSION_PAGES = 50; // 50 * 100 = 5,000, far beyond reality
const MAX_EMAIL_PAGES = 30; // cross-check scan cap: 3,000 sent emails

function authorized(req: NextRequest): boolean {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  return !!token && token === process.env.REA_AGENT_SECRET;
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Escape the LIKE wildcards that can legitimately appear in an address
// so the ilike match stays a literal comparison.
function likeLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function torontoToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function normalizeEmail(raw: any): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const angled = trimmed.match(/<([^>]+)>/);
  return (angled ? angled[1] : trimmed).trim().toLowerCase();
}

async function resendGet(apiKey: string, path: string): Promise<any> {
  const res = await fetch(`${RESEND_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend GET ${path} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

type Suppression = { email: string; origin: string | null };

async function fetchAllSuppressions(apiKey: string): Promise<Suppression[]> {
  const out: Suppression[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < MAX_SUPPRESSION_PAGES; page++) {
    const params = new URLSearchParams({ limit: '100' });
    if (after) params.set('after', after);
    const body: any = await resendGet(apiKey, `/suppressions?${params.toString()}`);
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    for (const row of rows) {
      const email = normalizeEmail(row?.email);
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push({ email, origin: typeof row?.origin === 'string' ? row.origin : null });
    }
    if (!body?.has_more || rows.length === 0) break;
    after = rows[rows.length - 1]?.id || null;
    if (!after) break;
  }
  return out;
}

// Recipients whose latest event is a bounce, from the sent-emails list.
// Cross-check only — see the header comment.
async function fetchBouncedRecipients(
  apiKey: string
): Promise<{ recipients: Set<string>; scanned: number; truncated: boolean }> {
  const recipients = new Set<string>();
  let scanned = 0;
  let truncated = false;
  let after: string | null = null;
  for (let page = 0; page < MAX_EMAIL_PAGES; page++) {
    const params = new URLSearchParams({ limit: '100' });
    if (after) params.set('after', after);
    const body: any = await resendGet(apiKey, `/emails?${params.toString()}`);
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    scanned += rows.length;
    for (const row of rows) {
      if (row?.last_event !== 'bounced') continue;
      const tos: any[] = Array.isArray(row?.to) ? row.to : [];
      for (const to of tos) {
        const email = normalizeEmail(to);
        if (email) recipients.add(email);
      }
    }
    if (!body?.has_more || rows.length === 0) break;
    if (page === MAX_EMAIL_PAGES - 1) {
      truncated = true;
      break;
    }
    after = rows[rows.length - 1]?.id || null;
    if (!after) break;
  }
  return { recipients, scanned, truncated };
}

type AddressInfo = {
  email: string;
  bounced: boolean;
  suppressed: boolean;
  origin: string | null;
  source: 'resend_api' | 'tim_dashboard' | 'resend_api+tim_dashboard';
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
  }

  try {
    const body: any = await req.json().catch(() => null);
    const extras: { email: string; category: 'bounced' | 'suppressed' }[] = [];
    if (Array.isArray(body?.extra_addresses)) {
      for (const item of body.extra_addresses) {
        const email = normalizeEmail(item?.email);
        const category = item?.category === 'bounced' ? 'bounced' : 'suppressed';
        if (email && email.includes('@')) extras.push({ email, category });
      }
    }

    const suppressions = await fetchAllSuppressions(apiKey);
    const emailScan = await fetchBouncedRecipients(apiKey);

    // ---- Build the address set with per-address provenance ----
    const addresses = new Map<string, AddressInfo>();
    const apiEmails = new Set<string>();
    for (const s of suppressions) {
      apiEmails.add(s.email);
      addresses.set(s.email, {
        email: s.email,
        bounced: s.origin === 'bounce',
        suppressed: s.origin !== 'bounce',
        origin: s.origin,
        source: 'resend_api',
      });
    }
    const extrasNotFoundInApi: string[] = [];
    for (const extra of extras) {
      const existing = addresses.get(extra.email);
      if (!apiEmails.has(extra.email)) extrasNotFoundInApi.push(extra.email);
      if (existing) {
        if (extra.category === 'bounced') existing.bounced = true;
        else existing.suppressed = true;
        existing.source = 'resend_api+tim_dashboard';
      } else {
        addresses.set(extra.email, {
          email: extra.email,
          bounced: extra.category === 'bounced',
          suppressed: extra.category === 'suppressed',
          origin: null,
          source: 'tim_dashboard',
        });
      }
    }

    const suppressedFound = [...addresses.values()].filter(a => a.suppressed).length;
    const bouncedFound = [...addresses.values()].filter(a => a.bounced).length;
    const overlap = [...addresses.values()].filter(a => a.suppressed && a.bounced).length;

    // ---- Clear matched contacts ----
    const supabase = db();
    const nowIso = new Date().toISOString();
    const sweepDate = torontoToday();

    let matched = 0;
    let cleared = 0;
    let suppressedCleared = 0;
    let bouncedCleared = 0;
    let alreadyFlagged = 0;
    let notesWritten = 0;
    let notesFailed = 0;
    const list: {
      name: string;
      email_removed: string;
      category: string;
      source: string;
    }[] = [];

    for (const info of addresses.values()) {
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, email_invalid, assigned_user_id')
        .eq('account_id', ACCOUNT_ID)
        .ilike('email', likeLiteral(info.email));
      if (error) throw error;
      if (!contacts || contacts.length === 0) continue;

      const category = info.bounced && info.suppressed
        ? 'bounced/suppressed'
        : info.bounced
          ? 'bounced'
          : 'suppressed';
      const reason = info.origin === 'complaint'
        ? 'spam_complaint'
        : info.bounced
          ? 'bounced'
          : 'suppressed';

      for (const contact of contacts as any[]) {
        matched++;
        const wasFlagged = contact.email_invalid === true;
        if (wasFlagged) alreadyFlagged++;

        const patch: Record<string, any> = { email: null };
        if (!wasFlagged) {
          patch.email_invalid = true;
          patch.email_invalid_reason = reason;
          patch.email_invalid_at = nowIso;
        }
        const { error: updateError } = await supabase
          .from('contacts')
          .update(patch)
          .eq('id', contact.id);
        if (updateError) throw updateError;
        cleared++;
        if (info.suppressed) suppressedCleared++;
        if (info.bounced) bouncedCleared++;

        // Note the clear on the contact (authored by its assigned
        // user — the notes table only accepts real users). A failed
        // note is counted, never fatal.
        if (contact.assigned_user_id) {
          const { error: noteError } = await supabase.from('notes').insert({
            contact_id: contact.id,
            user_id: contact.assigned_user_id,
            content: `Email cleared \u2014 address ${category} (Resend, ${sweepDate})`,
          });
          if (noteError) notesFailed++;
          else notesWritten++;
        } else {
          notesFailed++;
        }

        const name = [contact.first_name, contact.last_name]
          .filter((part: any) => typeof part === 'string' && part.trim() !== '')
          .join(' ')
          .trim();
        list.push({
          name: name || '(no name)',
          email_removed: info.email,
          category,
          source: info.source,
        });
      }
    }

    // ---- Cross-check: bounced recipients the sweep did NOT clear ----
    const notCleared: string[] = [];
    for (const email of emailScan.recipients) {
      if (addresses.has(email)) continue;
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id')
        .eq('account_id', ACCOUNT_ID)
        .ilike('email', likeLiteral(email))
        .limit(1);
      if (error) throw error;
      if (contacts && contacts.length > 0) notCleared.push(email);
    }

    const apiByOrigin: Record<string, number> = {};
    for (const s of suppressions) {
      const key = s.origin || 'unknown';
      apiByOrigin[key] = (apiByOrigin[key] || 0) + 1;
    }

    return NextResponse.json({
      api_suppressions_total: suppressions.length,
      api_suppressions_by_origin: apiByOrigin,
      suppressed_found: suppressedFound,
      bounced_found: bouncedFound,
      overlap,
      matched,
      cleared,
      suppressed_cleared: suppressedCleared,
      bounced_cleared: bouncedCleared,
      already_flagged: alreadyFlagged,
      notes_written: notesWritten,
      notes_failed: notesFailed,
      extras_not_found_in_api: extrasNotFoundInApi,
      emails_scan: {
        scanned: emailScan.scanned,
        truncated: emailScan.truncated,
        bounced_recipients: emailScan.recipients.size,
        not_cleared: notCleared,
      },
      list,
    });
  } catch (err: any) {
    console.error('Resend suppression sweep error:', err);
    return NextResponse.json({ error: err.message || 'Sweep failed.' }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/resend-suppression-sweep — sweeps Resend's team suppression
// list into the CRM (Tim, 2026-11-03). The Resend webhook flags contacts on
// NEW suppression events, but historical suppressions were never swept in;
// this route closes that gap and is safe to re-run.
//
// What it does:
//  1. Pulls every suppressed address from Resend — GET
//     https://api.resend.com/suppressions (limit=100, `after` cursor
//     pagination) — using the server-side RESEND_API_KEY.
//  2. Matches contacts in the FC account by email (case-insensitive).
//  3. For each match, CLEARS the stored email (set NULL — the contact row,
//     name, phone and history all stay; Tim: keep the contacts, remove the
//     dead addresses) and mirrors the webhook's email_invalid marking for
//     contacts not already flagged, so a swept contact looks identical to a
//     webhook-flagged one. Origin -> reason mirrors the webhook handler:
//     bounce -> 'bounced', complaint -> 'spam_complaint',
//     manual -> 'suppressed'. Already-flagged contacts keep their original
//     reason/timestamp; only the email is cleared.
//  Nothing is ever deleted here (the webhook's junk-pattern deletion is
//  deliberately NOT copied).
//
// Auth: Bearer <secret>, same as the other /api/admin routes.
// POST (no body) -> { suppressed_found, matched, cleared, already_flagged,
//                     list: [{ name, email_removed }] }
// Idempotent: cleared contacts no longer carry an email, so a second run
// matches nothing new and clears 0.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';
const RESEND_API_BASE = 'https://api.resend.com';
const MAX_PAGES = 50; // 50 * 100 = 5,000 suppressions, far beyond reality

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

function reasonForOrigin(origin: string | null | undefined): string {
  if (origin === 'complaint') return 'spam_complaint';
  if (origin === 'bounce') return 'bounced';
  return 'suppressed'; // manual or anything else
}

// Escape the LIKE wildcards that can legitimately appear in an address so
// the ilike match stays a literal comparison.
function likeLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

type Suppression = { email: string; origin: string | null };

async function fetchAllSuppressions(apiKey: string): Promise<Suppression[]> {
  const out: Suppression[] = [];
  const seen = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${RESEND_API_BASE}/suppressions`);
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend suppressions list failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const body: any = await res.json();
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    for (const row of rows) {
      const email = typeof row?.email === 'string' ? row.email.trim().toLowerCase() : '';
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

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
  }

  try {
    const suppressions = await fetchAllSuppressions(apiKey);
    const supabase = db();
    const nowIso = new Date().toISOString();

    let matched = 0;
    let cleared = 0;
    let alreadyFlagged = 0;
    const list: { name: string; email_removed: string }[] = [];

    for (const suppression of suppressions) {
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, email_invalid')
        .eq('account_id', ACCOUNT_ID)
        .ilike('email', likeLiteral(suppression.email));
      if (error) throw error;
      if (!contacts || contacts.length === 0) continue;

      for (const contact of contacts as any[]) {
        matched++;
        const wasFlagged = contact.email_invalid === true;
        if (wasFlagged) alreadyFlagged++;

        // Clear the dead address. Newly matched contacts also get the
        // webhook's flag marking; already-flagged contacts keep their
        // original reason/timestamp untouched.
        const patch: Record<string, any> = { email: null };
        if (!wasFlagged) {
          patch.email_invalid = true;
          patch.email_invalid_reason = reasonForOrigin(suppression.origin);
          patch.email_invalid_at = nowIso;
        }
        const { error: updateError } = await supabase
          .from('contacts')
          .update(patch)
          .eq('id', contact.id);
        if (updateError) throw updateError;

        cleared++;
        const name = [contact.first_name, contact.last_name]
          .filter((part: any) => typeof part === 'string' && part.trim() !== '')
          .join(' ')
          .trim();
        list.push({ name: name || '(no name)', email_removed: suppression.email });
      }
    }

    return NextResponse.json({
      suppressed_found: suppressions.length,
      matched,
      cleared,
      already_flagged: alreadyFlagged,
      list,
    });
  } catch (err: any) {
    console.error('Resend suppression sweep error:', err);
    return NextResponse.json({ error: err.message || 'Sweep failed.' }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Past Client Review — GET/POST /api/past-clients-review (session auth).
// Backs /dashboard/past-clients: Tim walks the past-client archive one
// item at a time against the live contacts and records decisions.
//
// Two decision levels:
//  - ITEM level (legacy): decision 'add' | 'merge' | 'skip' (+ chosen
//    contact for a merge). "Skip whole item" also lands here.
//  - PERSON level: person_decisions = { [person_key]: {
//        decision?: 'merge' | 'add' | 'skip',   // update / add new / skip this person
//        contact_id?: string | null,            // for merge
//        assign?: { emails: string[], phones: string[] },  // file details assigned to this person
//        address?: { choice: 'candidate' | 'blank' | 'keep', value?: string }
//    } } — saved in full whenever Tim decides any person on the item;
//    the item's decision column becomes 'persons' once any person has a
//    decision. An item counts as decided when it carries an item-level
//    decision OR every person on it has a person decision.
//
// This route ONLY records decisions — applying them happens in a
// separate, later step.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

async function requireUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user;
}

function serviceDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function resolveAccount(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('account_users')
    .select('account_id, role')
    .eq('user_id', userId)
    .single();
  return data as { account_id: string; role: string } | null;
}

const ITEM_DECISIONS = ['add', 'merge', 'skip'] as const;

function personList(it: any): any[] {
  return Array.isArray(it?.payload?.persons) ? it.payload.persons : [];
}

function itemDecided(it: any): boolean {
  if (ITEM_DECISIONS.includes(it.decision)) return true;
  const persons = personList(it);
  if (!persons.length) return false;
  const pd = it.person_decisions || {};
  return persons.every((p: any) => pd[p.person_key]?.decision);
}

function progressOf(items: any[]) {
  const p = {
    total: items.length,
    decided: 0,
    add: 0,
    merge: 0,
    skip: 0,
    persons_total: 0,
    persons_decided: 0,
  };
  for (const it of items) {
    if (itemDecided(it)) p.decided++;
    if (ITEM_DECISIONS.includes(it.decision)) {
      p[it.decision as 'add' | 'merge' | 'skip']++;
    }
    const persons = personList(it);
    p.persons_total += persons.length;
    const pd = it.person_decisions || {};
    for (const person of persons) {
      const d = pd[person.person_key]?.decision;
      if (d && ITEM_DECISIONS.includes(d)) {
        p.persons_decided++;
        p[d as 'add' | 'merge' | 'skip']++;
      }
    }
  }
  return p;
}

const COLUMNS =
  'item_key, sort_order, payload, match_status, match_candidates, decision, chosen_contact_id, person_decisions, decided_at, applied_at, apply_result';

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }
    const supabase = serviceDb();
    const membership = await resolveAccount(supabase, user.id);
    if (!membership) {
      return NextResponse.json(
        { error: 'No account for this user.' },
        { status: 403 }
      );
    }
    const { data, error } = await supabase
      .from('past_client_review_items')
      .select(COLUMNS)
      .order('sort_order', { ascending: true });
    if (error) {
      // Table not created yet (setup SQL pending) — answer honestly.
      return NextResponse.json({
        needsSetup: true,
        items: [],
        progress: {
          total: 0,
          decided: 0,
          add: 0,
          merge: 0,
          skip: 0,
          persons_total: 0,
          persons_decided: 0,
        },
      });
    }
    const items = ((data || []) as any[]).map((it) => ({
      ...it,
      person_decisions: it.person_decisions || {},
    }));
    return NextResponse.json({ items, progress: progressOf(items) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Server error.' },
      { status: 500 }
    );
  }
}

const PERSON_DECISIONS = ['merge', 'add', 'skip'] as const;
const ADDRESS_CHOICES = ['candidate', 'blank', 'keep'] as const;

function cleanStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string').slice(0, 12);
}

function sanitizePersonDecisions(raw: any): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(raw as Record<string, any>)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    const entry: any = {};
    if (val.decision != null) {
      if (!PERSON_DECISIONS.includes(val.decision)) return null;
      entry.decision = val.decision;
    }
    if (entry.decision === 'merge') {
      if (typeof val.contact_id !== 'string' || !val.contact_id) return null;
      entry.contact_id = val.contact_id;
    } else if (typeof val.contact_id === 'string' && val.contact_id) {
      entry.contact_id = val.contact_id;
    } else {
      entry.contact_id = null;
    }
    if (val.assign && typeof val.assign === 'object') {
      entry.assign = {
        emails: cleanStringArray(val.assign.emails),
        phones: cleanStringArray(val.assign.phones),
      };
    }
    if (val.address && typeof val.address === 'object') {
      const choice = val.address.choice;
      if (!ADDRESS_CHOICES.includes(choice)) return null;
      entry.address = {
        choice,
        value:
          choice === 'candidate' && typeof val.address.value === 'string'
            ? val.address.value
            : '',
      };
    }
    out[key] = entry;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }
    const supabase = serviceDb();
    const membership = await resolveAccount(supabase, user.id);
    if (!membership) {
      return NextResponse.json(
        { error: 'No account for this user.' },
        { status: 403 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const itemKey = typeof body?.item_key === 'string' ? body.item_key : '';
    if (!itemKey) {
      return NextResponse.json(
        { error: 'item_key is required.' },
        { status: 400 }
      );
    }

    // ---- PERSON-level save ----
    if (body?.person_decisions !== undefined) {
      const pd = sanitizePersonDecisions(body.person_decisions);
      if (!pd) {
        return NextResponse.json(
          { error: 'person_decisions is not in the expected shape.' },
          { status: 400 }
        );
      }
      const { data: current } = await supabase
        .from('past_client_review_items')
        .select('decision')
        .eq('item_key', itemKey)
        .maybeSingle();
      if (!current) {
        return NextResponse.json(
          { error: 'That item was not found.' },
          { status: 404 }
        );
      }
      const anyDecided = Object.values(pd).some((e: any) => e?.decision);
      const patch: any = { person_decisions: pd };
      if (anyDecided) {
        patch.decision = 'persons';
        patch.chosen_contact_id = null;
        patch.decided_by = user.id;
        patch.decided_at = new Date().toISOString();
      } else if ((current as any).decision === 'persons') {
        patch.decision = null;
        patch.chosen_contact_id = null;
        patch.decided_by = null;
        patch.decided_at = null;
      }
      const { data: updated, error } = await supabase
        .from('past_client_review_items')
        .update(patch)
        .eq('item_key', itemKey)
        .select(COLUMNS)
        .maybeSingle();
      if (error) {
        return NextResponse.json({
          needsSetup: true,
          error: 'The review table is not set up yet.',
        });
      }
      if (!updated) {
        return NextResponse.json(
          { error: 'That item was not found.' },
          { status: 404 }
        );
      }
      const { data: all } = await supabase
        .from('past_client_review_items')
        .select(COLUMNS);
      const items = ((all || []) as any[]).map((it) => ({
        ...it,
        person_decisions: it.person_decisions || {},
      }));
      return NextResponse.json({
        ok: true,
        item: { ...(updated as any), person_decisions: pd },
        progress: progressOf(items),
      });
    }

    // ---- ITEM-level save (legacy + skip-whole-item) ----
    const decision = body?.decision ?? null;
    const chosenContactId =
      typeof body?.chosen_contact_id === 'string' && body.chosen_contact_id
        ? body.chosen_contact_id
        : null;
    if (
      decision !== null &&
      !(ITEM_DECISIONS as readonly string[]).includes(decision)
    ) {
      return NextResponse.json(
        { error: 'decision must be add, merge, skip or null.' },
        { status: 400 }
      );
    }
    if (decision === 'merge' && !chosenContactId) {
      return NextResponse.json(
        { error: 'Pick which contact to update first.' },
        { status: 400 }
      );
    }

    const patch =
      decision === null
        ? {
            decision: null,
            chosen_contact_id: null,
            decided_by: null,
            decided_at: null,
          }
        : {
            decision,
            // chosen_contact_id is only meaningful for a merge.
            chosen_contact_id: decision === 'merge' ? chosenContactId : null,
            decided_by: user.id,
            decided_at: new Date().toISOString(),
          };

    const { data: updated, error } = await supabase
      .from('past_client_review_items')
      .update(patch)
      .eq('item_key', itemKey)
      .select(COLUMNS)
      .maybeSingle();
    if (error) {
      return NextResponse.json({
        needsSetup: true,
        error: 'The review table is not set up yet.',
      });
    }
    if (!updated) {
      return NextResponse.json(
        { error: 'That item was not found.' },
        { status: 404 }
      );
    }
    const { data: all } = await supabase
      .from('past_client_review_items')
      .select('decision, payload, person_decisions');
    return NextResponse.json({
      ok: true,
      item: {
        ...(updated as any),
        person_decisions: (updated as any).person_decisions || {},
      },
      progress: progressOf((all || []) as any[]),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Server error.' },
      { status: 500 }
    );
  }
}

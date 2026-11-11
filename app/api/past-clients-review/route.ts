/* eslint-disable @typescript-eslint/no-explicit-any */
// Past Client Review — GET/POST /api/past-clients-review (session auth).
// Backs /dashboard/past-clients: Tim walks the past-client archive one
// item at a time against the live contacts and records a decision per
// item ('add' = create new contact later, 'merge' = update the chosen
// existing contact, 'skip' = don't import). This route ONLY records
// decisions — applying them happens in a separate, later step.
//
// Rows live in public.past_client_review_items (seeded by Rea from the
// archive + match analysis). Before the setup SQL/seed runs, GET answers
// { needsSetup: true } so the page can say so honestly instead of 500ing.

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

function progressOf(items: any[]) {
  const p = { total: items.length, decided: 0, add: 0, merge: 0, skip: 0 };
  for (const it of items) {
    if (it.decision === 'add') {
      p.decided++;
      p.add++;
    } else if (it.decision === 'merge') {
      p.decided++;
      p.merge++;
    } else if (it.decision === 'skip') {
      p.decided++;
      p.skip++;
    }
  }
  return p;
}

const COLUMNS =
  'item_key, sort_order, payload, match_status, match_candidates, decision, chosen_contact_id, decided_at, applied_at, apply_result';

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
        progress: { total: 0, decided: 0, add: 0, merge: 0, skip: 0 },
      });
    }
    const items = (data || []) as any[];
    return NextResponse.json({ items, progress: progressOf(items) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Server error.' },
      { status: 500 }
    );
  }
}

const DECISIONS = ['add', 'merge', 'skip'] as const;

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
    const decision = body?.decision ?? null;
    const chosenContactId =
      typeof body?.chosen_contact_id === 'string' && body.chosen_contact_id
        ? body.chosen_contact_id
        : null;
    if (!itemKey) {
      return NextResponse.json(
        { error: 'item_key is required.' },
        { status: 400 }
      );
    }
    if (
      decision !== null &&
      !(DECISIONS as readonly string[]).includes(decision)
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
      .select('decision');
    return NextResponse.json({
      ok: true,
      item: updated,
      progress: progressOf((all || []) as any[]),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Server error.' },
      { status: 500 }
    );
  }
}

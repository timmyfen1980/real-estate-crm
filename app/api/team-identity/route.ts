/* eslint-disable @typescript-eslint/no-explicit-any */
// Team & Brand settings — GET/POST /api/team-identity (session auth).
// The account's identity fields live on the accounts row (team_name,
// brokerage_name + the setup-SQL columns) and each person's title on
// their profile. lib/teamIdentity.ts resolves them for every branded
// surface; this route is how the owner edits them (Account page card).
//
// Before the one-time setup SQL runs, the new columns don't exist:
// GET still answers (fallbacks), and POST saves the fields that DO
// exist and reports the rest as needsSetup so the UI can say so
// honestly instead of pretending everything saved.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTeamIdentity } from '@/lib/teamIdentity';

const ACCOUNT_FIELDS = [
  'team_name',
  'brokerage_name',
  'brokerage_address',
  'info_email',
  'office_phone',
  'website_url',
  'instagram_handle',
  'instagram_collabs',
] as const;

const LEGACY_FIELDS = ['team_name', 'brokerage_name'] as const;

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
    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', membership.account_id)
      .maybeSingle();
    const identity = await getTeamIdentity(supabase, membership.account_id);
    const a: any = account || {};
    const fields: Record<string, string> = {};
    for (const k of ACCOUNT_FIELDS) {
      fields[k] = typeof a[k] === 'string' ? a[k] : '';
    }
    return NextResponse.json({
      fields,
      people: identity.people,
      footerPreview: identity.people.length
        ? [
            identity.people
              .slice(0, 2)
              .map((p) => `${p.name}, ${p.title}`)
              .join(' · '),
            identity.infoEmail,
            identity.officePhone,
          ]
            .filter(Boolean)
            .join(' · ')
        : '',
      canEdit: membership.role === 'owner',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Server error.' },
      { status: 500 }
    );
  }
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
    if (membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the account owner can change Team & Brand settings.' },
        { status: 403 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const incoming: Record<string, any> = body?.fields || {};
    const update: Record<string, string> = {};
    for (const k of ACCOUNT_FIELDS) {
      if (typeof incoming[k] === 'string') update[k] = incoming[k].trim();
    }

    const pending: string[] = [];
    if (Object.keys(update).length) {
      const { error } = await supabase
        .from('accounts')
        .update(update)
        .eq('id', membership.account_id);
      if (error) {
        // New columns missing (setup SQL not run yet): save the legacy
        // subset and report the rest as pending.
        const legacy: Record<string, string> = {};
        for (const k of LEGACY_FIELDS) {
          if (k in update) legacy[k] = update[k];
        }
        for (const k of Object.keys(update)) {
          if (!(LEGACY_FIELDS as readonly string[]).includes(k)) {
            pending.push(k);
          }
        }
        if (Object.keys(legacy).length) {
          const { error: legacyError } = await supabase
            .from('accounts')
            .update(legacy)
            .eq('id', membership.account_id);
          if (legacyError) throw legacyError;
        }
      }
    }

    // People's titles live on profiles.title.
    const titles: Record<string, any> = body?.titles || {};
    const titleIds = Object.keys(titles).filter(
      (id) => typeof titles[id] === 'string'
    );
    let titlesPending = false;
    for (const id of titleIds) {
      const { error } = await supabase
        .from('profiles')
        .update({ title: String(titles[id]).trim() })
        .eq('id', id);
      if (error) {
        titlesPending = true;
        break;
      }
    }
    if (titlesPending) pending.push('titles');

    return NextResponse.json({
      ok: true,
      needsSetup: pending.length > 0,
      pending,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Server error.' },
      { status: 500 }
    );
  }
}

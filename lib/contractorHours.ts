/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared helpers for Beth's Hours — contractor time entries + invoicing.
//
// Beth Nickle is a contractor who bills Tim Fennessey Personal Real Estate
// Corporation at an hourly rate stored in contractor_settings. Only Beth
// and the account owner (Tim) may use this feature. Data access goes
// through the service role after a session check, same pattern as
// app/api/admin/giveaways-create/route.ts.

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const FC_ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';
export const BETH_USER_ID = '96777aff-2ba6-4cbb-9fb8-1448c4237c20';
export const BETH_NAME = 'Beth Nickle';
export const BETH_EMAIL = 'beth@thefcgroup.ca';
export const BETH_PHONE = '905 668-3800';
export const BILL_TO_NAME = 'Tim Fennessey Personal Real Estate Corporation';
export const HST_RATE = 0.13;

export interface HoursContext {
  userId: string;
  role: string;
  isOwner: boolean;
  isBeth: boolean;
  supabase: SupabaseClient;
}

export type HoursAuthResult =
  | { ok: true; ctx: HoursContext }
  | { ok: false; response: NextResponse };

export async function requireHoursAccess(): Promise<HoursAuthResult> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }),
    };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: membership, error: membershipError } = await supabase
    .from('account_users')
    .select('account_id, role')
    .eq('user_id', user.id)
    .eq('account_id', FC_ACCOUNT_ID)
    .single();

  if (membershipError || !membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No access to this account.' },
        { status: 403 }
      ),
    };
  }

  const isOwner = membership.role === 'owner';
  const isBeth = user.id === BETH_USER_ID;
  if (!isOwner && !isBeth) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "This page is only for Beth and Tim." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    ctx: { userId: user.id, role: membership.role, isOwner, isBeth, supabase },
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toNum(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

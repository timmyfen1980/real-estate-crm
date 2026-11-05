/* eslint-disable @typescript-eslint/no-explicit-any */
// Lead Campaigns — social campaigns that pull leads, with attribution.
//
// A lead campaign is a named social push with a tracked capture link
// (capture page + "?c=<slug>"). When a capture form arrives carrying
// that slug, the contact it creates/updates is stamped in
// contacts.campaign, and the Campaigns board counts what each campaign
// pulled. NOT to be confused with the email drip campaigns
// (email_campaigns / contact_campaigns) — different concept entirely.
//
// Data note: Tim enabled RLS on lead_campaigns (Nov 3) with no
// policies, so the browser client cannot read or write the table
// (authenticated INSERT returns 42501). The dashboard page therefore
// goes through /api/lead-campaigns, which uses the service role after
// a session + account-membership check — the same pattern as
// lib/contractorHours.ts. The fix, if direct-client access is ever
// wanted, is one policy: "authenticated manage lead campaigns"
// (for all, to authenticated, using/with check true), mirroring the
// contractor_* tables.

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const CAPTURE_URLS: Record<string, string> = {
  valuation: 'https://www.thefcgroup.ca/valuation',
  watch: 'https://www.thefcgroup.ca/watch-my-area',
  giveaway: 'https://www.thefcgroup.ca/giveaway',
  qualify: 'https://www.thefcgroup.ca/qualify',
};

export const CAMPAIGN_GOALS = ['sellers', 'buyers', 'area', 'general'] as const;
export const CAMPAIGN_STATUSES = ['active', 'paused', 'ended'] as const;

// Layer 2 — campaign ideas ("Ideas from Rea"). Play keys mirror the
// lead_campaign_ideas.play comments in the schema; the page maps them to
// human labels.
export const IDEA_PLAYS = [
  'seller_push',
  'new_listing',
  'sold',
  'improved_price',
  'open_house',
  'market_update',
  'giveaway',
  'expired_area',
  'winner_clone',
] as const;

export const META_STATUSES = [
  'not_sent',
  'creating',
  'paused',
  'live',
  'ended',
] as const;

// Shared campaign row shape for API responses (layer 1 + 2 + 3 fields).
// `creative` is the layer-3 jsonb: { photo_urls, designed_url, approved }.
export const CAMPAIGN_SELECT =
  'id, account_id, name, slug, goal, channel, capture_type, capture_url, tracked_url, caption, status, budget_amount, budget_days, audience, meta_campaign_id, meta_status, spend, creative, created_by, created_at';

// Route ids must be real uuids before they touch a query — a malformed
// id used to reach Postgres and come back as a raw
// 'invalid input syntax for type uuid' error in a browser alert
// (Tim hit exactly that on Fetch photos, Nov 3, 2026).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

// Error text that is safe to show a person. Known, human messages
// (thrown deliberately by the libraries) pass through; database /
// driver internals are replaced with a plain fallback.
export function publicErrorMessage(
  err: any,
  fallback = 'Something went wrong on the server — please try again.'
): string {
  const m = String((err && err.message) || '');
  if (!m) return fallback;
  if (
    /invalid input syntax|duplicate key|violates|does not exist|permission denied|PGRST|JWT/i.test(
      m
    )
  ) {
    return fallback;
  }
  return m;
}

export const IDEA_SELECT =
  'id, play, title, subject, hook, suggested_caption, capture_type, goal, suggested_budget, suggested_days, audience, source_ref, status, built_campaign_id, created_at, expires_at';

export function slugify(name: string): string {
  const s = (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return s || 'campaign';
}

// ---------------------------------------------------------------------------
// Session access for the dashboard API route (any account member).
// ---------------------------------------------------------------------------

export interface LeadCampaignContext {
  userId: string;
  accountId: string;
  role: string;
  supabase: SupabaseClient;
}

export type LeadCampaignAuthResult =
  | { ok: true; ctx: LeadCampaignContext }
  | { ok: false; response: NextResponse };

export async function requireLeadCampaignAccess(): Promise<LeadCampaignAuthResult> {
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
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Not authenticated.' },
        { status: 401 }
      ),
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

  return {
    ok: true,
    ctx: {
      userId: user.id,
      accountId: membership.account_id,
      role: membership.role,
      supabase,
    },
  };
}

// ---------------------------------------------------------------------------
// Attribution for the public capture routes (service role, no session).
// Tracking must NEVER break a capture: every helper swallows its own
// errors and resolves to null / no-op on any problem.
// ---------------------------------------------------------------------------

// The website forwards the tracked link's ?c=<slug> as a form field
// named "c" and/or keeps it on the posted URL's query string — accept
// both.
export function parseCampaignParam(
  req: Request,
  formData: FormData
): string | null {
  try {
    const field = formData.get('c');
    if (typeof field === 'string' && field.trim()) {
      return field.trim().toLowerCase();
    }
  } catch {
    // fall through to the query param
  }
  try {
    const q = new URL(req.url).searchParams.get('c');
    if (q && q.trim()) return q.trim().toLowerCase();
  } catch {
    // ignore
  }
  return null;
}

// Returns the slug only when it matches an ACTIVE lead campaign in the
// account; unknown / paused / ended slugs are ignored silently.
export async function resolveActiveCampaignSlug(
  accountId: string,
  rawSlug: string | null
): Promise<string | null> {
  if (!rawSlug) return null;
  try {
    const { data } = await supabaseAdmin
      .from('lead_campaigns')
      .select('slug')
      .eq('account_id', accountId)
      .eq('slug', rawSlug)
      .eq('status', 'active')
      .maybeSingle();
    return data?.slug || null;
  } catch {
    return null;
  }
}

// Stamp an existing contact with the campaign slug.
export async function stampContactCampaign(
  contactId: string | null,
  slug: string | null
): Promise<void> {
  if (!contactId || !slug) return;
  try {
    await supabaseAdmin
      .from('contacts')
      .update({ campaign: slug })
      .eq('id', contactId);
  } catch {
    // tracking never breaks capture
  }
}

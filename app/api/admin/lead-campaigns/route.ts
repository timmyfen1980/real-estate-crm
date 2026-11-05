/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/lead-campaigns — Rea's collection-level admin access to
// lead campaigns. Auth: Bearer <REDACTED_TOKEN> (same as the
// other admin routes).
// GET ?instagram_status=requested → the campaigns whose creative is in
// that Instagram state (used by the Instagram send sweep to find the
// campaigns Tim has approved with "Approve & Send to Instagram").
// Without the filter, returns every campaign on the account.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CAMPAIGN_SELECT } from '@/lib/leadCampaigns';
import { parseCreative } from '@/lib/leadCampaignCreative';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

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

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const igStatus = req.nextUrl.searchParams.get('instagram_status');
    if (igStatus && !['none', 'requested', 'posted', 'failed'].includes(igStatus)) {
      return NextResponse.json(
        { error: 'Unknown Instagram status.' },
        { status: 400 }
      );
    }
    const supabase = db();
    const { data, error } = await supabase
      .from('lead_campaigns')
      .select(CAMPAIGN_SELECT)
      .eq('account_id', ACCOUNT_ID)
      .order('created_at', { ascending: false });
    if (error) throw error;

    let campaigns = data || [];
    if (igStatus) {
      campaigns = campaigns.filter(
        (c: any) => parseCreative(c.creative).instagram.status === igStatus
      );
    }
    return NextResponse.json({ campaigns });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/lead-campaigns/[id] — Rea writes Meta results back onto a
// lead campaign after creating/managing the Meta campaign agent-side.
// Auth: Bearer <REDACTED_TOKEN> (same as the other admin routes).
// PATCH { meta_campaign_id?, meta_status?, spend? } — only those three
// fields are writable here; meta_status is validated against the known
// set, spend must be a non-negative number.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CAMPAIGN_SELECT, META_STATUSES } from '@/lib/leadCampaigns';

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const updates: Record<string, any> = {};
    if (body?.meta_campaign_id !== undefined) {
      updates.meta_campaign_id =
        typeof body.meta_campaign_id === 'string' && body.meta_campaign_id.trim()
          ? body.meta_campaign_id.trim()
          : null;
    }
    if (body?.meta_status !== undefined) {
      if (!(META_STATUSES as readonly string[]).includes(body.meta_status)) {
        return NextResponse.json({ error: 'Unknown Meta status.' }, { status: 400 });
      }
      updates.meta_status = body.meta_status;
    }
    if (body?.spend !== undefined) {
      const n = Number(body.spend);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'Invalid spend.' }, { status: 400 });
      }
      updates.spend = n;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const supabase = db();
    const { data, error } = await supabase
      .from('lead_campaigns')
      .update(updates)
      .eq('id', id)
      .eq('account_id', ACCOUNT_ID)
      .select(CAMPAIGN_SELECT)
      .single();
    if (error) throw error;

    return NextResponse.json({ campaign: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — layer 3 creative actions for Rea (agent-secret):
//   { action: 'fetch_photos' }            → (re)fetch the photos
//   { action: 'generate', hero_url? }     → (re)build the graphic
//   { action: 'backfill' }                → fetch if needed, then
//        generate if photos exist and no design yet (the one-shot
//        bootstrap for campaigns created before layer 3)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : '';
    if (!['fetch_photos', 'generate', 'backfill'].includes(action)) {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    const supabase = db();
    const { data: campaign, error } = await supabase
      .from('lead_campaigns')
      .select(CAMPAIGN_SELECT)
      .eq('id', id)
      .eq('account_id', ACCOUNT_ID)
      .single();
    if (error || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found.' },
        { status: 404 }
      );
    }

    const creativeLib = await import('@/lib/leadCampaignCreative');
    let creative = creativeLib.parseCreative(campaign.creative);

    if (action === 'fetch_photos') {
      creative = await creativeLib.fetchCampaignPhotos(supabase, campaign);
    } else if (action === 'generate') {
      const heroUrl =
        typeof body?.hero_url === 'string' ? body.hero_url : null;
      creative = await creativeLib.generateCampaignGraphic(
        supabase,
        campaign,
        heroUrl
      );
    } else {
      // backfill
      if (!creative.photo_urls.length) {
        creative = await creativeLib.fetchCampaignPhotos(supabase, campaign);
      }
      if (creative.photo_urls.length && !creative.designed_url) {
        creative = await creativeLib.generateCampaignGraphic(
          supabase,
          { ...campaign, creative },
          null
        );
      }
    }

    const { data: fresh } = await supabase
      .from('lead_campaigns')
      .select(CAMPAIGN_SELECT)
      .eq('id', id)
      .eq('account_id', ACCOUNT_ID)
      .single();
    return NextResponse.json({ campaign: fresh, creative });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

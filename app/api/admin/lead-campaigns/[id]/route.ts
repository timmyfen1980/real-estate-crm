/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/lead-campaigns/[id] — Rea writes Meta results back onto a
// lead campaign after creating/managing the Meta campaign agent-side.
// Auth: Bearer <REDACTED_TOKEN> (same as the other admin routes).
// PATCH { meta_campaign_id?, meta_status?, spend?, instagram? } —
// meta_status is validated against the known set, spend must be a
// non-negative number, and instagram is Rea's layer-4 write-back
// ({ status: 'posted'|'failed', post_id?, post_url?, error? }).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CAMPAIGN_SELECT,
  META_STATUSES,
  isUuid,
} from '@/lib/leadCampaigns';
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Invalid campaign id.' },
        { status: 400 }
      );
    }
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
    // Layer 4: Instagram write-back from Rea after the real post —
    // { instagram: { status: 'posted'|'failed', post_id?, post_url?,
    // error? } } merged into the existing creative jsonb (photos,
    // design and approval are preserved).
    const wantsIg = body?.instagram !== undefined;
    if (wantsIg) {
      const ig = body.instagram || {};
      if (!['posted', 'failed'].includes(ig.status)) {
        return NextResponse.json(
          { error: 'Unknown Instagram status.' },
          { status: 400 }
        );
      }
    }
    if (Object.keys(updates).length === 0 && !wantsIg) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const supabase = db();
    if (wantsIg) {
      const { data: row } = await supabase
        .from('lead_campaigns')
        .select('creative')
        .eq('id', id)
        .eq('account_id', ACCOUNT_ID)
        .single();
      if (!row) {
        return NextResponse.json(
          { error: 'Campaign not found.' },
          { status: 404 }
        );
      }
      const creative = parseCreative(row.creative);
      const str = (v: any) =>
        typeof v === 'string' && v ? v : null;
      creative.instagram = {
        status: body.instagram.status,
        requested_at: creative.instagram.requested_at,
        post_id: str(body.instagram.post_id),
        post_url: str(body.instagram.post_url),
        error: str(body.instagram.error),
      };
      updates.creative = creative;
    }
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
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: 'Invalid campaign id.' },
        { status: 400 }
      );
    }
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

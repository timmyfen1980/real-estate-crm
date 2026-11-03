/* eslint-disable @typescript-eslint/no-explicit-any */
// Lead Campaigns, layer 3 — creative actions (session auth; any
// account member). POST /api/lead-campaigns/[id]/creative
//   JSON { action: 'fetch_photos' }              → (re)fetch photos
//   JSON { action: 'generate', hero_url? }       → (re)build the
//        designed graphic; hero_url (must be one of the campaign's
//        photos) becomes the new hero first
//   multipart form (field "file")                → upload a photo into
//        account-assets/campaign-creatives/<id>/ and record it; if the
//        campaign has no designed graphic yet, generate one fail-soft
//
// Same access pattern as /api/lead-campaigns (service role after the
// session + membership check — RLS on lead_campaigns has no
// authenticated policies).

import { NextRequest, NextResponse } from 'next/server';
import { CAMPAIGN_SELECT, requireLeadCampaignAccess } from '@/lib/leadCampaigns';
import {
  CREATIVE_BUCKET,
  addUploadedPhoto,
  fetchCampaignPhotos,
  generateCampaignGraphic,
  parseCreative,
} from '@/lib/leadCampaignCreative';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function loadCampaign(
  supabase: any,
  accountId: string,
  id: string
): Promise<any | null> {
  const { data } = await supabase
    .from('lead_campaigns')
    .select(CAMPAIGN_SELECT)
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();
  return data || null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireLeadCampaignAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    const supabase = ctx.supabase;
    const { id } = await params;

    const campaign = await loadCampaign(supabase, ctx.accountId, id);
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found.' },
        { status: 404 }
      );
    }

    const contentType = req.headers.get('content-type') || '';

    // ---- upload ------------------------------------------------------------
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: 'No file uploaded.' },
          { status: 400 }
        );
      }
      if (!file.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'That file is not an image.' },
          { status: 400 }
        );
      }
      if (file.size > 12 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'Image is too large (12 MB max).' },
          { status: 400 }
        );
      }
      const safeName = file.name
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(-60) || 'photo.jpg';
      const path = `campaign-creatives/${campaign.id}/${Date.now()}-${safeName}`;
      const buf = Buffer.from(await file.arrayBuffer());
      const { error: upError } = await supabase.storage
        .from(CREATIVE_BUCKET)
        .upload(path, buf, { contentType: file.type, upsert: true });
      if (upError) throw upError;
      const { data: pub } = supabase.storage
        .from(CREATIVE_BUCKET)
        .getPublicUrl(path);

      let creative = await addUploadedPhoto(supabase, campaign, pub.publicUrl);
      // First photo and no design yet → build the graphic too.
      if (!creative.designed_url) {
        try {
          creative = await generateCampaignGraphic(
            supabase,
            { ...campaign, creative },
            null
          );
        } catch {
          // photo is saved either way; generation can be retried
        }
      }
      const fresh = await loadCampaign(supabase, ctx.accountId, id);
      return NextResponse.json({
        campaign: fresh,
        creative: parseCreative(fresh?.creative),
      });
    }

    // ---- JSON actions --------------------------------------------------------
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : '';

    if (action === 'fetch_photos') {
      const creative = await fetchCampaignPhotos(supabase, campaign);
      const fresh = await loadCampaign(supabase, ctx.accountId, id);
      return NextResponse.json({ campaign: fresh, creative });
    }

    if (action === 'generate') {
      const heroUrl =
        typeof body?.hero_url === 'string' ? body.hero_url : null;
      if (heroUrl && !parseCreative(campaign.creative).photo_urls.includes(heroUrl)) {
        return NextResponse.json(
          { error: 'That photo is not on this campaign.' },
          { status: 400 }
        );
      }
      const creative = await generateCampaignGraphic(
        supabase,
        campaign,
        heroUrl
      );
      const fresh = await loadCampaign(supabase, ctx.accountId, id);
      return NextResponse.json({ campaign: fresh, creative });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Lead Campaign ideas — session actions (any account member).
// POST /api/lead-campaigns/ideas/[id]/build   — turn an idea into a live
//        campaign: name/goal/capture/budget/audience come from the idea,
//        the caption is the suggested caption with the campaign's tracked
//        URL appended on its own line, meta_status starts 'not_sent'.
//        The idea is then marked built with built_campaign_id.
// POST /api/lead-campaigns/ideas/[id]/dismiss — idea status 'dismissed'.
//
// Same access pattern as /api/lead-campaigns (service role after the
// session + membership check — RLS on the campaign tables has no
// authenticated policies).

import { NextRequest, NextResponse } from 'next/server';
import {
  CAMPAIGN_SELECT,
  CAPTURE_URLS,
  IDEA_SELECT,
  requireLeadCampaignAccess,
  slugify,
} from '@/lib/leadCampaigns';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const { id, action } = await params;
    if (action !== 'build' && action !== 'dismiss') {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 404 });
    }
    void req;

    const auth = await requireLeadCampaignAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    const supabase = ctx.supabase;

    const { data: idea, error: ideaError } = await supabase
      .from('lead_campaign_ideas')
      .select(IDEA_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .single();
    if (ideaError || !idea) {
      return NextResponse.json({ error: 'Idea not found.' }, { status: 404 });
    }

    if (action === 'dismiss') {
      const { data, error } = await supabase
        .from('lead_campaign_ideas')
        .update({ status: 'dismissed' })
        .eq('id', id)
        .eq('account_id', ctx.accountId)
        .select(IDEA_SELECT)
        .single();
      if (error) throw error;
      return NextResponse.json({ idea: data });
    }

    // build -----------------------------------------------------------------
    if (idea.status !== 'new') {
      return NextResponse.json(
        { error: 'This idea has already been handled.' },
        { status: 409 }
      );
    }

    const captureType = CAPTURE_URLS[idea.capture_type]
      ? idea.capture_type
      : 'valuation';

    // Unique slug per account: suffix -2, -3, ... on collision.
    const baseSlug = slugify(idea.title);
    const { data: existing, error: existingError } = await supabase
      .from('lead_campaigns')
      .select('slug')
      .eq('account_id', ctx.accountId);
    if (existingError) throw existingError;
    const taken = new Set((existing || []).map((r: any) => r.slug));
    let slug = baseSlug;
    let n = 2;
    while (taken.has(slug)) {
      slug = `${baseSlug}-${n}`;
      n += 1;
    }

    const captureUrl = CAPTURE_URLS[captureType];
    const trackedUrl = `${captureUrl}?c=${slug}`;
    const captionParts: string[] = [];
    if (idea.suggested_caption && idea.suggested_caption.trim()) {
      captionParts.push(idea.suggested_caption.trim());
    }
    captionParts.push(trackedUrl);
    const caption = captionParts.join('\n\n');

    const { data: campaign, error: insertError } = await supabase
      .from('lead_campaigns')
      .insert({
        account_id: ctx.accountId,
        name: idea.title,
        slug,
        goal: idea.goal,
        channel: 'social',
        capture_type: captureType,
        capture_url: captureUrl,
        tracked_url: trackedUrl,
        caption,
        budget_amount: idea.suggested_budget,
        budget_days: idea.suggested_days,
        audience: idea.audience,
        meta_status: 'not_sent',
        status: 'active',
        created_by: ctx.userId,
      })
      .select(CAMPAIGN_SELECT)
      .single();
    if (insertError) throw insertError;

    const { error: markError } = await supabase
      .from('lead_campaign_ideas')
      .update({ status: 'built', built_campaign_id: campaign.id })
      .eq('id', id)
      .eq('account_id', ctx.accountId);
    if (markError) throw markError;

    return NextResponse.json({
      campaign: {
        ...campaign,
        counts: { pulled: 0, contacted: 0, clients: 0, deals: 0 },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

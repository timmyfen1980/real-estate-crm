/* eslint-disable @typescript-eslint/no-explicit-any */
// Lead Campaigns — dashboard API (session auth; any account member).
// GET   /api/lead-campaigns — campaigns for the account + live counts,
//        plus the "Ideas from Rea" feed (new, unexpired ideas).
// POST  /api/lead-campaigns — create a campaign (slug + tracked URL,
//        optional budget/days/audience).
// PATCH /api/lead-campaigns — update status / caption / budget fields.
//
// Counts (per campaign, contacts stamped via contacts.campaign = slug):
//   pulled    = stamped contacts
//   contacted = stamped contacts whose linked lead has moved past New
//               or has a last_contacted_at
//   clients   = stamped contacts with a linked lead at status Client,
//               or with a deal
//   deals     = deal rows linked to stamped contacts
//
// Data goes through the service role after the session check (see
// lib/leadCampaigns.ts for why — RLS on lead_campaigns has no
// authenticated policies).

import { NextRequest, NextResponse } from 'next/server';
import {
  CAMPAIGN_GOALS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_SELECT,
  CAPTURE_URLS,
  IDEA_SELECT,
  requireLeadCampaignAccess,
  slugify,
} from '@/lib/leadCampaigns';
import { parseCreative } from '@/lib/leadCampaignCreative';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const auth = await requireLeadCampaignAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    const supabase = ctx.supabase;

    // Ideas from Rea (layer 2). Fail-soft: before the layer-2 SQL runs,
    // the table doesn't exist — the page then just shows no ideas.
    let ideas: any[] = [];
    try {
      const nowIso = new Date().toISOString();
      const { data: ideaRows, error: ideasError } = await supabase
        .from('lead_campaign_ideas')
        .select(IDEA_SELECT)
        .eq('account_id', ctx.accountId)
        .eq('status', 'new')
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('created_at', { ascending: false });
      if (!ideasError) ideas = ideaRows || [];
    } catch {
      ideas = [];
    }

    const { data: campaigns, error } = await supabase
      .from('lead_campaigns')
      .select(CAMPAIGN_SELECT)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = campaigns || [];
    const counts: Record<
      string,
      { pulled: number; contacted: number; clients: number; deals: number }
    > = {};
    for (const c of rows) {
      counts[c.slug] = { pulled: 0, contacted: 0, clients: 0, deals: 0 };
    }

    const slugs = rows.map((c: any) => c.slug);
    if (slugs.length > 0) {
      const { data: stamped, error: stampedError } = await supabase
        .from('contacts')
        .select('id, campaign')
        .eq('account_id', ctx.accountId)
        .in('campaign', slugs);
      if (stampedError) throw stampedError;

      const stampedIds = (stamped || []).map((c: any) => c.id);
      const slugByContact = new Map<string, string>();
      for (const c of stamped || []) {
        slugByContact.set(c.id, c.campaign);
        counts[c.campaign].pulled += 1;
      }

      if (stampedIds.length > 0) {
        const { data: leads, error: leadsError } = await supabase
          .from('leads')
          .select('contact_id, status, last_contacted_at')
          .eq('account_id', ctx.accountId)
          .in('contact_id', stampedIds);
        if (leadsError) throw leadsError;

        const { data: deals, error: dealsError } = await supabase
          .from('deals')
          .select('contact_id')
          .eq('account_id', ctx.accountId)
          .in('contact_id', stampedIds);
        if (dealsError) throw dealsError;

        const contactedSet = new Set<string>();
        const clientSet = new Set<string>();
        for (const lead of leads || []) {
          if (!lead.contact_id) continue;
          if (lead.status !== 'New' || lead.last_contacted_at) {
            contactedSet.add(lead.contact_id);
          }
          if (lead.status === 'Client') {
            clientSet.add(lead.contact_id);
          }
        }
        for (const deal of deals || []) {
          if (!deal.contact_id) continue;
          const slug = slugByContact.get(deal.contact_id);
          if (slug) counts[slug].deals += 1;
          clientSet.add(deal.contact_id);
        }
        for (const contactId of contactedSet) {
          const slug = slugByContact.get(contactId);
          if (slug) counts[slug].contacted += 1;
        }
        for (const contactId of clientSet) {
          const slug = slugByContact.get(contactId);
          if (slug) counts[slug].clients += 1;
        }
      }
    }

    return NextResponse.json({
      ideas,
      campaigns: rows.map((c: any) => ({ ...c, counts: counts[c.slug] })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireLeadCampaignAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    const supabase = ctx.supabase;

    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const goal = typeof body.goal === 'string' ? body.goal : 'sellers';
    const captureType =
      typeof body.capture_type === 'string' ? body.capture_type : 'valuation';
    const caption =
      typeof body.caption === 'string' && body.caption.trim()
        ? body.caption.trim()
        : null;
    const budgetAmount =
      body.budget_amount !== undefined &&
      body.budget_amount !== null &&
      body.budget_amount !== ''
        ? Number(body.budget_amount)
        : null;
    if (budgetAmount !== null && (!Number.isFinite(budgetAmount) || budgetAmount < 0)) {
      return NextResponse.json({ error: 'Invalid budget.' }, { status: 400 });
    }
    const budgetDays =
      body.budget_days !== undefined && body.budget_days !== null && body.budget_days !== ''
        ? Number(body.budget_days)
        : null;
    if (budgetDays !== null && (!Number.isInteger(budgetDays) || budgetDays < 1)) {
      return NextResponse.json({ error: 'Invalid days.' }, { status: 400 });
    }
    const audience =
      typeof body.audience === 'string' && body.audience.trim()
        ? body.audience.trim()
        : null;

    if (!name) {
      return NextResponse.json(
        { error: 'Give the campaign a name.' },
        { status: 400 }
      );
    }
    if (!(CAMPAIGN_GOALS as readonly string[]).includes(goal)) {
      return NextResponse.json({ error: 'Unknown goal.' }, { status: 400 });
    }
    if (!CAPTURE_URLS[captureType]) {
      return NextResponse.json(
        { error: 'Unknown capture page.' },
        { status: 400 }
      );
    }

    // Unique slug per account: suffix -2, -3, ... on collision.
    const baseSlug = slugify(name);
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
    const { data, error } = await supabase
      .from('lead_campaigns')
      .insert({
        account_id: ctx.accountId,
        name,
        slug,
        goal,
        channel: 'social',
        capture_type: captureType,
        capture_url: captureUrl,
        tracked_url: `${captureUrl}?c=${slug}`,
        caption,
        budget_amount: budgetAmount,
        budget_days: budgetDays,
        audience,
        status: 'active',
        created_by: ctx.userId,
      })
      .select(CAMPAIGN_SELECT)
      .single();
    if (error) throw error;

    // Layer 3: best-effort creative bootstrap (photos + designed
    // graphic). Fail-soft — the page's manual controls remain if the
    // listing has no findable photos.
    let created: any = data;
    try {
      const { ensureCampaignCreative } = await import(
        '@/lib/leadCampaignCreative'
      );
      await ensureCampaignCreative(supabase, created);
      const { data: fresh } = await supabase
        .from('lead_campaigns')
        .select(CAMPAIGN_SELECT)
        .eq('id', created.id)
        .eq('account_id', ctx.accountId)
        .single();
      if (fresh) created = fresh;
    } catch {
      // creative is best-effort at create time
    }

    return NextResponse.json({
      campaign: {
        ...created,
        counts: { pulled: 0, contacted: 0, clients: 0, deals: 0 },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireLeadCampaignAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    const supabase = ctx.supabase;

    const body = await req.json();
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json(
        { error: 'Missing campaign id.' },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {};
    if (typeof body.status === 'string') {
      if (!(CAMPAIGN_STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json(
          { error: 'Unknown status.' },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }
    if (typeof body.caption === 'string') {
      updates.caption = body.caption.trim() ? body.caption.trim() : null;
    }
    if (body.budget_amount !== undefined) {
      if (body.budget_amount === null || body.budget_amount === '') {
        updates.budget_amount = null;
      } else {
        const n = Number(body.budget_amount);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: 'Invalid budget.' }, { status: 400 });
        }
        updates.budget_amount = n;
      }
    }
    if (body.budget_days !== undefined) {
      if (body.budget_days === null || body.budget_days === '') {
        updates.budget_days = null;
      } else {
        const n = Number(body.budget_days);
        if (!Number.isInteger(n) || n < 1) {
          return NextResponse.json({ error: 'Invalid days.' }, { status: 400 });
        }
        updates.budget_days = n;
      }
    }
    if (typeof body.audience === 'string') {
      updates.audience = body.audience.trim() ? body.audience.trim() : null;
    }
    // Layer 3 creative updates: approve/unapprove the designed graphic,
    // or choose a different hero photo (reorder only — regeneration is
    // an explicit action on the creative route).
    if (
      body.creative_approved !== undefined ||
      typeof body.hero_url === 'string'
    ) {
      const { data: current, error: currentError } = await supabase
        .from('lead_campaigns')
        .select('creative')
        .eq('id', id)
        .eq('account_id', ctx.accountId)
        .single();
      if (currentError) throw currentError;
      const creative = parseCreative(current?.creative);
      if (body.creative_approved !== undefined) {
        if (typeof body.creative_approved !== 'boolean') {
          return NextResponse.json(
            { error: 'Invalid creative_approved.' },
            { status: 400 }
          );
        }
        creative.approved = body.creative_approved;
      }
      if (typeof body.hero_url === 'string') {
        if (!creative.photo_urls.includes(body.hero_url)) {
          return NextResponse.json(
            { error: 'That photo is not on this campaign.' },
            { status: 400 }
          );
        }
        creative.photo_urls = [
          body.hero_url,
          ...creative.photo_urls.filter((u) => u !== body.hero_url),
        ];
      }
      updates.creative = creative;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Nothing to update.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('lead_campaigns')
      .update(updates)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(CAMPAIGN_SELECT)
      .single();
    if (error) throw error;

    return NextResponse.json({ campaign: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

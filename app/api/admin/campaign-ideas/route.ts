/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/campaign-ideas — Rea feeds the "Ideas from Rea" queue.
// Auth: Bearer <REDACTED_TOKEN> (same as the other admin routes).
// POST — insert ONE campaign idea for the FC Group account. play,
// capture_type and goal are validated against the known sets; the idea
// starts life as status 'new' and shows on the CRM Lead Campaigns page
// until Tim builds or dismisses it (or it expires).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CAMPAIGN_GOALS, CAPTURE_URLS, IDEA_PLAYS } from '@/lib/leadCampaigns';

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

function cleanText(v: any): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));

    const play = typeof body?.play === 'string' ? body.play : '';
    if (!(IDEA_PLAYS as readonly string[]).includes(play)) {
      return NextResponse.json({ error: 'Unknown play.' }, { status: 400 });
    }
    const title = cleanText(body?.title);
    if (!title) {
      return NextResponse.json({ error: 'An idea needs a title.' }, { status: 400 });
    }
    const captureType =
      typeof body?.capture_type === 'string' ? body.capture_type : 'valuation';
    if (!CAPTURE_URLS[captureType]) {
      return NextResponse.json({ error: 'Unknown capture page.' }, { status: 400 });
    }
    const goal = typeof body?.goal === 'string' ? body.goal : 'sellers';
    if (!(CAMPAIGN_GOALS as readonly string[]).includes(goal)) {
      return NextResponse.json({ error: 'Unknown goal.' }, { status: 400 });
    }
    const suggestedBudget =
      body?.suggested_budget !== undefined &&
      body?.suggested_budget !== null &&
      body?.suggested_budget !== ''
        ? Number(body.suggested_budget)
        : null;
    if (
      suggestedBudget !== null &&
      (!Number.isFinite(suggestedBudget) || suggestedBudget < 0)
    ) {
      return NextResponse.json({ error: 'Invalid suggested budget.' }, { status: 400 });
    }
    const suggestedDays =
      body?.suggested_days !== undefined &&
      body?.suggested_days !== null &&
      body?.suggested_days !== ''
        ? Number(body.suggested_days)
        : null;
    if (suggestedDays !== null && (!Number.isInteger(suggestedDays) || suggestedDays < 1)) {
      return NextResponse.json({ error: 'Invalid suggested days.' }, { status: 400 });
    }
    let expiresAt: string | null = null;
    if (typeof body?.expires_at === 'string' && body.expires_at.trim()) {
      const d = new Date(body.expires_at);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid expires_at.' }, { status: 400 });
      }
      expiresAt = d.toISOString();
    }

    const supabase = db();
    const { data, error } = await supabase
      .from('lead_campaign_ideas')
      .insert({
        account_id: ACCOUNT_ID,
        play,
        title,
        subject: cleanText(body?.subject),
        hook: cleanText(body?.hook),
        suggested_caption: cleanText(body?.suggested_caption),
        capture_type: captureType,
        goal,
        suggested_budget: suggestedBudget,
        suggested_days: suggestedDays,
        audience: cleanText(body?.audience),
        source_ref: cleanText(body?.source_ref),
        status: 'new',
        expires_at: expiresAt,
      })
      .select(
        'id, play, title, subject, hook, suggested_caption, capture_type, goal, suggested_budget, suggested_days, audience, source_ref, status, built_campaign_id, created_at, expires_at'
      )
      .single();
    if (error) throw error;

    return NextResponse.json({ idea: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

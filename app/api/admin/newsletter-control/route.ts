/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/newsletter-control — pause/resume + read-only audit for the
// Monthly Homeowner Newsletter campaign ONLY.
// Auth: Bearer REA_AGENT_SECRET.
// Why this works: the email processor (app/api/email/processor/route.ts) only
// sends contact_campaigns rows with status='active' and never checks the
// campaign's own status, so pausing = flipping THIS campaign's active rows to
// 'paused'. Reversible: resume flips them back. No other campaign is touched.
// GET  -> audit: sends in the last 30 days by step (+ out-of-season count),
//         enrollment distribution, and next-30-days exposure if unpaused.
// POST { action: 'pause' | 'resume' | 'status' }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const NEWSLETTER_CAMPAIGN_ID = 'bb0b2174-639b-43fc-9f03-2bb289210de2';

// Step number -> the calendar month its content belongs to (sequence runs June -> May).
const STEP_MONTH: Record<number, string> = {
  1: 'June',
  2: 'July',
  3: 'August',
  4: 'September',
  5: 'October',
  6: 'November',
  7: 'December',
  8: 'January',
  9: 'February',
  10: 'March',
  11: 'April',
  12: 'May',
};

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

function monthNameOf(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
}

async function fetchAllRows(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  apply: (q: any) => any
): Promise<any[]> {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let page = 0; page < 100; page++) {
    const q = apply(supabase.from(table).select(columns));
    const { data, error } = await q.range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const supabase = db();
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const until30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Step map from the live sequences
    const { data: sequences, error: seqError } = await supabase
      .from('email_sequences')
      .select('id, step_number, subject')
      .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
      .order('step_number', { ascending: true });
    if (seqError) throw seqError;

    const seqStep = new Map<string, number>();
    const stepSubject = new Map<number, string>();
    for (const s of sequences || []) {
      seqStep.set(s.id, s.step_number);
      stepSubject.set(s.step_number, s.subject);
    }

    // All sent newsletter logs (paged)
    const logs = await fetchAllRows(supabase, 'email_logs', 'sequence_id, sent_at', (q: any) =>
      q.eq('campaign_id', NEWSLETTER_CAMPAIGN_ID).eq('status', 'sent')
    );

    const byStepAllTime: Record<string, number> = {};
    const byStepLast30: Record<
      string,
      { step: number; subject: string; month: string; sent: number; out_of_season: number }
    > = {};
    let last30Total = 0;
    let last30OutOfSeason = 0;

    for (const log of logs) {
      const step = seqStep.get(log.sequence_id) || 0;
      const key = String(step);
      byStepAllTime[key] = (byStepAllTime[key] || 0) + 1;
      if (new Date(log.sent_at) >= since30) {
        last30Total++;
        if (!byStepLast30[key]) {
          byStepLast30[key] = {
            step,
            subject: stepSubject.get(step) || '(unknown step)',
            month: STEP_MONTH[step] || '(unknown)',
            sent: 0,
            out_of_season: 0,
          };
        }
        byStepLast30[key].sent++;
        if (STEP_MONTH[step] && monthNameOf(log.sent_at) !== STEP_MONTH[step]) {
          byStepLast30[key].out_of_season++;
          last30OutOfSeason++;
        }
      }
    }

    // Enrollment rows for this campaign
    const enrollments = await fetchAllRows(
      supabase,
      'contact_campaigns',
      'status, current_step, next_send_at',
      (q: any) => q.eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
    );

    const byStatus: Record<string, number> = {};
    const activeByStep: Record<string, number> = {};
    let dueNext30 = 0;
    let dueNext30WrongMonth = 0;
    const exposureByStep: Record<
      string,
      { step: number; month: string; due: number; wrong_month: number }
    > = {};

    for (const row of enrollments) {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      if (row.status !== 'active') continue;
      const sk = String(row.current_step);
      activeByStep[sk] = (activeByStep[sk] || 0) + 1;
      if (row.next_send_at && new Date(row.next_send_at) <= until30) {
        dueNext30++;
        if (!exposureByStep[sk]) {
          exposureByStep[sk] = {
            step: row.current_step,
            month: STEP_MONTH[row.current_step] || '(unknown)',
            due: 0,
            wrong_month: 0,
          };
        }
        exposureByStep[sk].due++;
        if (STEP_MONTH[row.current_step] && monthNameOf(row.next_send_at) !== STEP_MONTH[row.current_step]) {
          exposureByStep[sk].wrong_month++;
          dueNext30WrongMonth++;
        }
      }
    }

    return NextResponse.json({
      campaign_id: NEWSLETTER_CAMPAIGN_ID,
      generated_at: now.toISOString(),
      sends_last_30_days: {
        total: last30Total,
        out_of_season: last30OutOfSeason,
        by_step: Object.values(byStepLast30).sort((a, b) => a.step - b.step),
      },
      sends_all_time_by_step: byStepAllTime,
      sends_all_time_total: logs.length,
      enrollment: {
        total: enrollments.length,
        by_status: byStatus,
        active_by_current_step: activeByStep,
      },
      exposure_next_30_days_if_unpaused: {
        due: dueNext30,
        wrong_month: dueNext30WrongMonth,
        by_step: Object.values(exposureByStep).sort((a, b) => a.step - b.step),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Audit failed.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const supabase = db();

    if (action === 'pause' || action === 'resume') {
      const from = action === 'pause' ? 'active' : 'paused';
      const to = action === 'pause' ? 'paused' : 'active';
      const { data, error } = await supabase
        .from('contact_campaigns')
        .update({ status: to })
        .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
        .eq('status', from)
        .select('id');
      if (error) throw error;
      return NextResponse.json({
        action,
        campaign_id: NEWSLETTER_CAMPAIGN_ID,
        rows_changed: (data || []).length,
        from_status: from,
        to_status: to,
      });
    }

    if (action === 'status') {
      const rows = await fetchAllRows(supabase, 'contact_campaigns', 'status', (q: any) =>
        q.eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
      );
      const byStatus: Record<string, number> = {};
      for (const r of rows) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      }
      return NextResponse.json({
        campaign_id: NEWSLETTER_CAMPAIGN_ID,
        total: rows.length,
        by_status: byStatus,
      });
    }

    return NextResponse.json(
      { error: "Body must be { action: 'pause' | 'resume' | 'status' }." },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Action failed.' }, { status: 500 });
  }
}

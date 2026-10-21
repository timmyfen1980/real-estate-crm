/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/task-engine — deal-date auto-task engine.
// Auth: Bearer REA_AGENT_SECRET.
// POST { action: 'sync' } -> for every deal in the FC account with an
// active/firm status (Active / Sold Conditional / Sold Firm — never
// Closed) that carries a closing_date, make sure the closing milestone
// tasks exist:
//   closing - 7 days: "Closing in one week — {address}"
//   closing - 1 day:  "Closing tomorrow — {address}"        (priority high)
//   closing + 1 day:  "Send closing gift & thank-you — {address}"
//   closing + 7 days: "Post-close check-in call — {address}"
// Milestones are stored with source='auto_milestone' and deduped on
// (title, due_date) across ALL statuses, so re-running never duplicates
// and a completed milestone never resurrects. A milestone whose due
// date is more than 1 day in the past (Toronto) is skipped — no
// backfill spam; the +1/+7 post-close milestones for a just-closed
// deal still land because their due dates fall inside that window.
// Each task is assigned to the deal's agent (account owner as fallback)
// and linked to the deal's lead when the deal's contact has one.
//
// SCHEMA NOTE: no CRM code anywhere references date columns on the
// deals table (the deal create/edit screens carry only contact,
// property, agent, type, status). If closing_date does not exist, the
// deals query errors and this route reports
// closing_date_available: false instead of failing — the sync is then
// a clean no-op, and it starts working the moment the column exists.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';
const ACTIVE_DEAL_STATUSES = ['Active', 'Sold Conditional', 'Sold Firm'];

type DealRow = {
  id: string;
  contact_id: string | null;
  property_id: string | null;
  assigned_user_id: string | null;
  status: string;
  closing_date: string | null;
};

type Milestone = {
  offsetDays: number;
  titlePrefix: string;
  priority: string;
};

const MILESTONES: Milestone[] = [
  { offsetDays: -7, titlePrefix: 'Closing in one week', priority: 'medium' },
  { offsetDays: -1, titlePrefix: 'Closing tomorrow', priority: 'high' },
  { offsetDays: 1, titlePrefix: 'Send closing gift & thank-you', priority: 'medium' },
  { offsetDays: 7, titlePrefix: 'Post-close check-in call', priority: 'medium' },
];

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

// YYYY-MM-DD in America/Toronto for a given instant.
function torontoDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  let year = '';
  let month = '';
  let day = '';
  for (const p of parts) {
    if (p.type === 'year') year = p.value;
    if (p.type === 'month') month = p.value;
    if (p.type === 'day') day = p.value;
  }
  return year + '-' + month + '-' + day;
}

// Add days to a YYYY-MM-DD date (pure date math, UTC-anchored at noon).
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// GET — assignment audit (added 2026-10-21): team members, every deal with
// its agent, and every open task with its assignee, so Rea can verify that
// milestone tasks land on the deal's agent and spot unassigned work.
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const supabase = db();

    const { data: members, error: membersError } = await supabase
      .from('account_users')
      .select('user_id, role')
      .eq('account_id', ACCOUNT_ID);
    if (membersError) throw membersError;

    const memberIds = (members || []).map((m: any) => m.user_id);
    const nameById = new Map<string, string>();
    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', memberIds);
      for (const p of profiles || []) {
        if (p.full_name) nameById.set(p.id, p.full_name);
      }
    }
    const team = (members || []).map((m: any) => ({
      user_id: m.user_id,
      role: m.role,
      full_name: nameById.get(m.user_id) || null,
    }));

    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, contact_id, property_id, assigned_user_id, status, closing_date')
      .eq('account_id', ACCOUNT_ID);
    if (dealsError) throw dealsError;

    const propertyIds = Array.from(
      new Set((deals || []).map((d: any) => d.property_id).filter(Boolean))
    );
    const addressByProperty = new Map<string, string>();
    if (propertyIds.length > 0) {
      const { data: props } = await supabase
        .from('properties')
        .select('id, address')
        .in('id', propertyIds);
      for (const p of props || []) {
        if (p.address) addressByProperty.set(p.id, p.address);
      }
    }

    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('id, title, due_date, priority, status, assigned_user_id, source, lead_id')
      .eq('account_id', ACCOUNT_ID)
      .neq('status', 'completed')
      .order('due_date', { ascending: true });
    if (tasksError) throw tasksError;

    // Which of the tasks' lead_ids still resolve to a real lead row?
    const taskLeadIds = Array.from(
      new Set((tasks || []).map((t: any) => t.lead_id).filter(Boolean))
    );
    const existingLeadIds = new Set<string>();
    if (taskLeadIds.length > 0) {
      const { data: leadRows } = await supabase
        .from('leads')
        .select('id')
        .in('id', taskLeadIds);
      for (const l of leadRows || []) existingLeadIds.add(l.id);
    }

    return NextResponse.json({
      team,
      deals: (deals || []).map((d: any) => ({
        id: d.id,
        address: d.property_id
          ? addressByProperty.get(d.property_id) || null
          : null,
        status: d.status,
        closing_date: d.closing_date,
        assigned_user_id: d.assigned_user_id,
        assigned_name: d.assigned_user_id
          ? nameById.get(d.assigned_user_id) || null
          : null,
      })),
      open_tasks: (tasks || []).map((t: any) => ({
        ...t,
        lead_exists: t.lead_id ? existingLeadIds.has(t.lead_id) : null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Audit failed.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || body.action !== 'sync') {
      return NextResponse.json(
        { error: "Body must be { action: 'sync' }." },
        { status: 400 }
      );
    }

    const supabase = db();
    const todayStr = torontoDateString(new Date());
    const cutoffStr = addDays(todayStr, -1);

    // --- Drip personal check-ins --------------------------------------
    // A lead on an active email drip who has not been contacted in 60+
    // days gets a 'Personal check-in' task (source 'drip_checkin'), so
    // the drip never runs for months without a human touch. Deduped per
    // lead: no new check-in if one was created in the last 55 days.
    // Best-effort: any failure here never breaks the milestone sync.
    let dripCheckinsCreated = 0;
    try {
      const { data: ownerRow2 } = await supabase
        .from('account_users')
        .select('user_id')
        .eq('account_id', ACCOUNT_ID)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle();
      const ownerFallback =
        ownerRow2 && typeof ownerRow2.user_id === 'string' ? ownerRow2.user_id : null;

      const { data: openLeads } = await supabase
        .from('leads')
        .select('id, first_name, last_name, contact_id, assigned_user_id, last_contacted_at, created_at, working_with_realtor')
        .eq('account_id', ACCOUNT_ID)
        .not('status', 'in', '("Client","Closed","Lost")');
      const leadList = (openLeads || []).filter((l: any) => !!l.contact_id);
      const cIds: string[] = [];
      for (const l of leadList) {
        if (cIds.indexOf(l.contact_id) < 0) cIds.push(l.contact_id);
      }

      if (cIds.length > 0) {
        const { data: enrolls } = await supabase
          .from('contact_campaigns')
          .select('contact_id, campaign_id')
          .in('contact_id', cIds)
          .eq('status', 'active');
        const campByContact = new Map<string, string>();
        const campIds: string[] = [];
        for (const e of enrolls || []) {
          if (!campByContact.has(e.contact_id)) campByContact.set(e.contact_id, e.campaign_id);
          if (campIds.indexOf(e.campaign_id) < 0) campIds.push(e.campaign_id);
        }

        const campNames = new Map<string, string>();
        if (campIds.length > 0) {
          const { data: camps } = await supabase
            .from('email_campaigns')
            .select('id, name')
            .in('id', campIds);
          for (const c of camps || []) campNames.set(c.id, c.name);
        }

        const since55 = addDays(todayStr, -55);
        const { data: recentCheckins } = await supabase
          .from('tasks')
          .select('lead_id, created_at')
          .eq('account_id', ACCOUNT_ID)
          .eq('source', 'drip_checkin')
          .gte('created_at', since55 + 'T00:00:00Z');
        const recentSet = new Set<string>();
        for (const t of recentCheckins || []) {
          if (t.lead_id) recentSet.add(t.lead_id);
        }

        const checkins: any[] = [];
        for (const l of leadList) {
          if ((l as any).working_with_realtor) continue; // hands-off rule
          const campId = campByContact.get(l.contact_id);
          if (!campId) continue;
          if (recentSet.has(l.id)) continue;
          const lastTouch = String(l.last_contacted_at || l.created_at || '').slice(0, 10);
          if (!lastTouch) continue;
          const days = Math.floor(
            (new Date(todayStr + 'T12:00:00Z').getTime() -
              new Date(lastTouch + 'T12:00:00Z').getTime()) /
              86400000
          );
          if (days <= 60) continue;
          const assignee = l.assigned_user_id || ownerFallback;
          if (!assignee) continue;
          checkins.push({
            account_id: ACCOUNT_ID,
            title:
              'Personal check-in — ' +
              l.first_name +
              ' ' +
              l.last_name +
              ' (on ' +
              (campNames.get(campId) || 'email') +
              ' drip)',
            due_date: todayStr,
            priority: 'medium',
            status: 'pending',
            assigned_user_id: assignee,
            lead_id: l.id,
            source: 'drip_checkin',
            created_by: assignee,
          });
        }

        if (checkins.length > 0) {
          const { error: ciError } = await supabase.from('tasks').insert(checkins);
          if (!ciError) dripCheckinsCreated = checkins.length;
        }
      }
    } catch {
      // Best-effort only.
    }

    // --- Hands-off cleanup (working-with-realtor rule) -----------------
    // Leads flagged working_with_realtor are never contacted except for
    // price-change emails on the home they viewed. Complete any open
    // auto follow-up / check-in tasks that point at them.
    let realtorTasksCleared = 0;
    try {
      const { data: realtorLeads } = await supabase
        .from('leads')
        .select('id')
        .eq('account_id', ACCOUNT_ID)
        .eq('working_with_realtor', true);
      const rIds = (realtorLeads || []).map((r: any) => r.id);
      if (rIds.length > 0) {
        const { data: cleared, error: clearErr } = await supabase
          .from('tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .in('lead_id', rIds)
          .in('source', ['lead_followup', 'drip_checkin'])
          .eq('status', 'pending')
          .select('id');
        if (!clearErr) realtorTasksCleared = (cleared || []).length;
      }
    } catch {
      // Best-effort only.
    }

    // --- Lead follow-ups (Tim's 7-day rule, 2026-10-21) ----------------
    // Any open lead whose last contact (or creation, if never contacted)
    // is more than 7 days ago gets a 'Follow up — {name}' task due
    // today, assigned to the lead's agent. Skipped when the lead already
    // has an open follow-up or drip check-in task, so nobody gets
    // double-nagged. Sending a follow-up email or adding a note stamps
    // last_contacted_at and completes these, restarting the clock.
    let leadFollowupsCreated = 0;
    try {
      const { data: ownerRow3 } = await supabase
        .from('account_users')
        .select('user_id')
        .eq('account_id', ACCOUNT_ID)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle();
      const owner3 =
        ownerRow3 && typeof ownerRow3.user_id === 'string' ? ownerRow3.user_id : null;

      const { data: openLeads2 } = await supabase
        .from('leads')
        .select('id, first_name, last_name, assigned_user_id, last_contacted_at, created_at, working_with_realtor')
        .eq('account_id', ACCOUNT_ID)
        .not('status', 'in', '("Client","Closed","Lost")');

      const { data: busyTasks } = await supabase
        .from('tasks')
        .select('lead_id')
        .eq('account_id', ACCOUNT_ID)
        .eq('status', 'pending')
        .in('source', ['lead_followup', 'drip_checkin'])
        .not('lead_id', 'is', null);
      const busyLeads = new Set<string>();
      for (const t of busyTasks || []) {
        if (t.lead_id) busyLeads.add(t.lead_id);
      }

      const followups: any[] = [];
      for (const l of openLeads2 || []) {
        if ((l as any).working_with_realtor) continue; // hands-off rule
        if (busyLeads.has(l.id)) continue;
        const lastTouch = String(l.last_contacted_at || l.created_at || '').slice(0, 10);
        if (!lastTouch) continue;
        const days = Math.floor(
          (new Date(todayStr + 'T12:00:00Z').getTime() -
            new Date(lastTouch + 'T12:00:00Z').getTime()) /
            86400000
        );
        if (days <= 7) continue;
        const assignee = l.assigned_user_id || owner3;
        if (!assignee) continue;
        followups.push({
          account_id: ACCOUNT_ID,
          title: 'Follow up — ' + l.first_name + ' ' + l.last_name,
          due_date: todayStr,
          priority: 'medium',
          status: 'pending',
          assigned_user_id: assignee,
          lead_id: l.id,
          source: 'lead_followup',
          created_by: assignee,
        });
      }

      if (followups.length > 0) {
        const { error: fuError } = await supabase.from('tasks').insert(followups);
        if (!fuError) leadFollowupsCreated = followups.length;
      }
    } catch {
      // Best-effort only.
    }

    // Deals probe: closing_date may not exist on the deals table.
    const { data: dealData, error: dealError } = await supabase
      .from('deals')
      .select('id, contact_id, property_id, assigned_user_id, status, closing_date')
      .eq('account_id', ACCOUNT_ID)
      .in('status', ACTIVE_DEAL_STATUSES);
    if (dealError) {
      return NextResponse.json({
        action: 'sync',
        created: 0,
        skipped_existing: 0,
        skipped_past: 0,
        deals_seen: 0,
        closing_date_available: false,
        note:
          'Deals query failed (' +
          dealError.message +
          '). The deals table most likely has no closing_date column; milestone sync is a no-op until one exists.',
      });
    }

    const dealRows = ((dealData || []) as DealRow[]).filter(function (d) {
      return !!d.closing_date;
    });
    const dealsSeen = dealRows.length;

    if (dealsSeen === 0) {
      return NextResponse.json({
        action: 'sync',
        created: 0,
        skipped_existing: 0,
        skipped_past: 0,
        deals_seen: 0,
        closing_date_available: true,
        drip_checkins_created: dripCheckinsCreated,
        lead_followups_created: leadFollowupsCreated,
        realtor_tasks_cleared: realtorTasksCleared,
      });
    }

    // Account owner (assignment fallback).
    let ownerId: string | null = null;
    const { data: ownerRow } = await supabase
      .from('account_users')
      .select('user_id')
      .eq('account_id', ACCOUNT_ID)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    if (ownerRow && typeof ownerRow.user_id === 'string') {
      ownerId = ownerRow.user_id;
    }

    // Property addresses.
    const propertyIds: string[] = [];
    for (const d of dealRows) {
      if (d.property_id && propertyIds.indexOf(d.property_id) < 0) {
        propertyIds.push(d.property_id);
      }
    }
    const addressByProperty = new Map<string, string>();
    if (propertyIds.length > 0) {
      const { data: propertyRows, error: propertyError } = await supabase
        .from('properties')
        .select('id, address')
        .eq('account_id', ACCOUNT_ID)
        .in('id', propertyIds);
      if (propertyError) throw propertyError;
      for (const p of propertyRows || []) {
        addressByProperty.set(p.id, p.address);
      }
    }

    // Most recent lead per contact (the deal's linked lead).
    const contactIds: string[] = [];
    for (const d of dealRows) {
      if (d.contact_id && contactIds.indexOf(d.contact_id) < 0) {
        contactIds.push(d.contact_id);
      }
    }
    const leadByContact = new Map<string, string>();
    if (contactIds.length > 0) {
      const { data: leadRows, error: leadError } = await supabase
        .from('leads')
        .select('id, contact_id, created_at')
        .eq('account_id', ACCOUNT_ID)
        .in('contact_id', contactIds)
        .order('created_at', { ascending: false });
      if (leadError) throw leadError;
      for (const l of leadRows || []) {
        if (l.contact_id && !leadByContact.has(l.contact_id)) {
          leadByContact.set(l.contact_id, l.id);
        }
      }
    }

    // Existing milestone tasks — the dedupe set (any status).
    const { data: existingRows, error: existingError } = await supabase
      .from('tasks')
      .select('title, due_date')
      .eq('account_id', ACCOUNT_ID)
      .eq('source', 'auto_milestone');
    if (existingError) throw existingError;
    const existingKeys = new Set<string>();
    for (const t of existingRows || []) {
      existingKeys.add(t.title + '|' + String(t.due_date || '').slice(0, 10));
    }

    let skippedExisting = 0;
    let skippedPast = 0;
    const toInsert: any[] = [];

    for (const deal of dealRows) {
      const closing = String(deal.closing_date).slice(0, 10);
      const address =
        (deal.property_id && addressByProperty.get(deal.property_id)) ||
        'Address not set';
      const assignee = deal.assigned_user_id || ownerId;
      const leadId = deal.contact_id
        ? leadByContact.get(deal.contact_id) || null
        : null;

      for (const m of MILESTONES) {
        const due = addDays(closing, m.offsetDays);
        const title = m.titlePrefix + ' — ' + address;
        const key = title + '|' + due;
        if (existingKeys.has(key)) {
          skippedExisting++;
          continue;
        }
        if (due < cutoffStr) {
          skippedPast++;
          continue;
        }
        existingKeys.add(key);
        toInsert.push({
          account_id: ACCOUNT_ID,
          title,
          due_date: due,
          priority: m.priority,
          status: 'pending',
          assigned_user_id: assignee,
          lead_id: leadId,
          source: 'auto_milestone',
          created_by: assignee,
        });
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from('tasks').insert(toInsert);
      if (insertError) throw insertError;
    }

    return NextResponse.json({
      action: 'sync',
      created: toInsert.length,
      skipped_existing: skippedExisting,
      skipped_past: skippedPast,
      deals_seen: dealsSeen,
      closing_date_available: true,
      drip_checkins_created: dripCheckinsCreated,
      lead_followups_created: leadFollowupsCreated,
      realtor_tasks_cleared: realtorTasksCleared,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Sync failed.' },
      { status: 500 }
    );
  }
}

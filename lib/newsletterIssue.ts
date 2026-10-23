// Shared helpers for the Monthly Issue newsletter model.
//
// The Monthly Homeowner Newsletter no longer runs as a per-contact drip.
// Under this model:
//  - Only the step matching the CURRENT calendar month (America/Toronto)
//    may ever be sent — June=step 1 ... October=step 5 ... May=step 12.
//  - An issue (keyed 'YYYY-MM', e.g. '2026-11') may only send when it has
//    been explicitly approved (a row in public.newsletter_approvals).
//    No row = not approved = nothing sends (fail-safe).
//  - Each run sends the current issue to active enrollments that have not
//    already received it this month (checked against email_logs), up to
//    the remaining daily cap. current_step / next_send_at are never used
//    or advanced for the newsletter.

import type { SupabaseClient } from '@supabase/supabase-js';

export const NEWSLETTER_CAMPAIGN_ID = 'bb0b2174-639b-43fc-9f03-2bb289210de2';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] || '';
}

// The sequence runs June -> May, so a calendar month maps to a fixed step.
export function stepForMonth(month: number): number {
  return ((month - 6 + 12) % 12) + 1;
}

export function issueKeyFor(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseIssueKey(
  key: string
): { year: number; month: number } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function torontoYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  let year = 0;
  let month = 0;
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value);
    if (p.type === 'month') month = Number(p.value);
  }
  return { year, month };
}

// 'YYYY-MM-DD' for `date` in America/Toronto.
export function torontoDateStr(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  let y = '';
  let m = '';
  let d = '';
  for (const p of parts) {
    if (p.type === 'year') y = p.value;
    if (p.type === 'month') m = p.value;
    if (p.type === 'day') d = p.value;
  }
  return `${y}-${m}-${d}`;
}

// The approval window for an issue opens on the 20th of the month
// BEFORE the issue month (Tim, 2026-10-23): the 'Approve December'
// task must not appear until Nov 20.
export function approvalOpensOn(year: number, month: number): string {
  const m = month === 1 ? 12 : month - 1;
  const y = month === 1 ? year - 1 : year;
  return `${y}-${String(m).padStart(2, '0')}-20`;
}

export function currentIssueKey(now: Date = new Date()): string {
  const { year, month } = torontoYearMonth(now);
  return issueKeyFor(year, month);
}

export function nextIssueKey(key: string): string {
  const parsed = parseIssueKey(key);
  if (!parsed) return key;
  const month = parsed.month === 12 ? 1 : parsed.month + 1;
  const year = parsed.month === 12 ? parsed.year + 1 : parsed.year;
  return issueKeyFor(year, month);
}

function torontoOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

function torontoMonthStart(year: number, month: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, 1, 0, 0, 0);
  const probe = new Date(utcMidnight + 5 * 60 * 60 * 1000);
  const offset = torontoOffsetMinutes(probe);
  return new Date(utcMidnight - offset * 60 * 1000);
}

// [start, end) instants covering the Toronto calendar month containing `date`.
export function torontoMonthWindow(date: Date): {
  startIso: string;
  endIso: string;
} {
  const { year, month } = torontoYearMonth(date);
  const start = torontoMonthStart(year, month);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = torontoMonthStart(nextYear, nextMonth);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export type IssueApproval = {
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  error?: string;
};

// Fail-safe: any error (including the approvals table not existing yet)
// is reported as NOT approved.
export async function getIssueApproval(
  supabase: SupabaseClient,
  issueKey: string
): Promise<IssueApproval> {
  const { data, error } = await supabase
    .from('newsletter_approvals')
    .select('issue_key, approved_at, approved_by')
    .eq('issue_key', issueKey)
    .maybeSingle();
  if (error) {
    return {
      approved: false,
      approved_at: null,
      approved_by: null,
      error: error.message,
    };
  }
  if (!data) {
    return { approved: false, approved_at: null, approved_by: null };
  }
  return {
    approved: true,
    approved_at: data.approved_at,
    approved_by: data.approved_by,
  };
}

export async function isIssueApproved(
  supabase: SupabaseClient,
  issueKey: string
): Promise<boolean> {
  const approval = await getIssueApproval(supabase, issueKey);
  return approval.approved;
}

// Skipped issues (Tim, 2026-10-22): an issue Tim has decided not to
// send at all — e.g. October 2026, which most subscribers already
// received under the old drip before the Monthly Issue model. A
// skip can never arm a send: approvals are rows in
// newsletter_approvals, and this list lives elsewhere (a storage
// JSON, the same pattern as the lawyer directory / Syngrafii
// settings). A skipped issue simply stays unapproved forever; the
// panel shows it as skipped instead of offering the Approve
// button. Reads fail safe to "not skipped".
const SKIPPED_ISSUES_PATH = 'system/newsletter-skipped-issues.json';

export async function getSkippedIssues(
  supabase: SupabaseClient
): Promise<string[]> {
  try {
    const { data, error } = await supabase.storage
      .from('client-documents')
      .download(SKIPPED_ISSUES_PATH);
    if (error || !data) return [];
    const parsed = JSON.parse(await data.text());
    const list = (parsed && parsed.skipped) || [];
    return Array.isArray(list)
      ? list.filter((k: any) => typeof k === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function skipIssue(
  supabase: SupabaseClient,
  issueKey: string
): Promise<{ skipped: string[] }> {
  if (!parseIssueKey(issueKey)) {
    throw new Error(`Invalid issue key "${issueKey}" — expected YYYY-MM.`);
  }
  const skipped = await getSkippedIssues(supabase);
  if (!skipped.includes(issueKey)) skipped.push(issueKey);
  const { error } = await supabase.storage
    .from('client-documents')
    .upload(
      SKIPPED_ISSUES_PATH,
      JSON.stringify({ skipped }, null, 2),
      { contentType: 'application/json', upsert: true }
    );
  if (error) {
    throw new Error(`Could not record the skip: ${error.message}`);
  }
  return { skipped };
}

export type IssueInfo = {
  key: string;
  year: number;
  month: number;
  month_name: string;
  step: number;
  subject: string | null;
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  skipped: boolean;
  approval_error?: string;
};

export type IssueStatus = {
  campaign_id: string;
  generated_at: string;
  current_issue: IssueInfo;
  next_issue: IssueInfo;
  pending_issue: IssueInfo | null;
  queued_issue: IssueInfo | null;
  pending_opens_on: string | null;
  enrollments: {
    total: number;
    active: number;
    paused: number;
    completed: number;
    other: number;
  };
  sent_this_month: number;
};

export async function getIssueStatus(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<IssueStatus> {
  const { year, month } = torontoYearMonth(now);
  const curKey = issueKeyFor(year, month);
  const curStep = stepForMonth(month);

  const { data: seqs } = await supabase
    .from('email_sequences')
    .select('step_number, subject')
    .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID);
  const subjectFor = (step: number): string | null => {
    const row = (seqs || []).find((s) => s.step_number === step);
    return row ? row.subject : null;
  };

  const [curApproval, skippedIssues] = await Promise.all([
    getIssueApproval(supabase, curKey),
    getSkippedIssues(supabase),
  ]);

  const { data: enrollmentRows } = await supabase
    .from('contact_campaigns')
    .select('status')
    .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
    .limit(10000);
  const counts = { total: 0, active: 0, paused: 0, completed: 0, other: 0 };
  for (const row of enrollmentRows || []) {
    counts.total++;
    if (row.status === 'active') counts.active++;
    else if (row.status === 'paused') counts.paused++;
    else if (row.status === 'completed') counts.completed++;
    else counts.other++;
  }

  const window = torontoMonthWindow(now);
  const { count: sentCount } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
    .eq('status', 'sent')
    .gte('sent_at', window.startIso)
    .lt('sent_at', window.endIso);

  const buildInfo = (
    key: string,
    y: number,
    m: number,
    step: number,
    approval: IssueApproval
  ): IssueInfo => {
    const info: IssueInfo = {
      key,
      year: y,
      month: m,
      month_name: monthName(m),
      step,
      subject: subjectFor(step),
      approved: approval.approved,
      approved_at: approval.approved_at,
      approved_by: approval.approved_by,
      skipped: skippedIssues.includes(key),
    };
    if (approval.error) info.approval_error = approval.error;
    return info;
  };

  const currentInfo = buildInfo(curKey, year, month, curStep, curApproval);

  // The approval panel is a decision queue (Tim, 2026-10-22): it
  // shows ONLY the next issue still waiting on a decision — the
  // first month from the current issue onward that is neither
  // approved nor skipped — and decided issues leave the panel
  // entirely. Approve November and December becomes the front of
  // the queue (`queued_issue`) — but it only turns into the
  // actionable `pending_issue` once its approval window opens on
  // the 20th of the month before (Tim, 2026-10-23), so nothing
  // asks for December's approval in October. `next_issue` keeps
  // its first-undecided-after-current meaning, with the plain
  // calendar-next issue as its fallback.
  let calendarNext: IssueInfo | null = null;
  let nextInfo: IssueInfo | null = null;
  let queuedInfo: IssueInfo | null = null;
  let queuedOpensOn: string | null = null;
  for (let ahead = 0; ahead <= 12; ahead++) {
    const m = ((month - 1 + ahead) % 12) + 1;
    const y = year + Math.floor((month - 1 + ahead) / 12);
    const key = issueKeyFor(y, m);
    const info =
      ahead === 0
        ? currentInfo
        : buildInfo(
            key,
            y,
            m,
            stepForMonth(m),
            await getIssueApproval(supabase, key)
          );
    if (ahead === 1) calendarNext = info;
    if (!info.approved && !info.skipped) {
      if (!queuedInfo) {
        queuedInfo = info;
        queuedOpensOn = approvalOpensOn(y, m);
      }
      if (ahead >= 1) {
        nextInfo = info;
        break;
      }
    }
  }

  // The front of the queue becomes the pending (actionable) issue
  // only once its approval window has opened — the 20th of the
  // month before the issue (Tim, 2026-10-23). Before that, the
  // panel and the approval task stay quiet; `queued_issue` and
  // `pending_opens_on` say what is in line and when it opens.
  const pendingInfo =
    queuedInfo && queuedOpensOn && torontoDateStr(now) >= queuedOpensOn
      ? queuedInfo
      : null;

  return {
    campaign_id: NEWSLETTER_CAMPAIGN_ID,
    generated_at: now.toISOString(),
    current_issue: currentInfo,
    next_issue: nextInfo || calendarNext || currentInfo,
    pending_issue: pendingInfo,
    queued_issue: queuedInfo,
    pending_opens_on: queuedOpensOn,
    enrollments: counts,
    sent_this_month: sentCount || 0,
  };
}

// Approving an issue is the single arming action: record the approval AND
// resume every paused newsletter enrollment. The sender still only sends
// the CURRENT month's issue, and only inside its own month, so approving a
// future issue early can never send anything out of season.
export async function approveIssue(
  supabase: SupabaseClient,
  issueKey: string,
  approvedBy: string
): Promise<{ resumed: number }> {
  if (!parseIssueKey(issueKey)) {
    throw new Error(`Invalid issue key "${issueKey}" — expected YYYY-MM.`);
  }
  const { error } = await supabase.from('newsletter_approvals').upsert(
    {
      issue_key: issueKey,
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    },
    { onConflict: 'issue_key' }
  );
  if (error) {
    throw new Error(`Could not record approval: ${error.message}`);
  }
  const { data, error: resumeError } = await supabase
    .from('contact_campaigns')
    .update({ status: 'active' })
    .eq('campaign_id', NEWSLETTER_CAMPAIGN_ID)
    .eq('status', 'paused')
    .select('id');
  if (resumeError) {
    throw new Error(
      `Approval recorded, but resuming enrollments failed: ${resumeError.message}`
    );
  }
  return { resumed: (data || []).length };
}

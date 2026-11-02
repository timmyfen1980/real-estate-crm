/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/leadContacted.ts — shared stamping for "a follow-up with this
// lead happened OUTSIDE the CRM" (Tim emailed the lead from his own
// Outlook, so no CRM send ever touched the lead's record).
//
// Used by:
//   - POST /api/admin/lead-contacted — Rea's mail watching recognized
//     the follow-up in Tim's Sent Items (source 'sent_mail')
//   - POST /api/leads/[id]/followup-done — the lead page's "Follow-up
//     done — sent from my email" button (source 'manual')
//
// The semantics mirror what the CRM already does when contact happens
// through its own surfaces:
//   - leads.last_contacted_at is stamped with the contact time
//     (/api/lead-followup and the note-add flow both stamp it)
//   - status 'New' becomes 'Contacted' — the same touch the inbound
//     /api/admin/lead-reply hook makes; contact is contact
//   - next_followup_date is set 7 days out from the contact (Toronto),
//     which is what /api/lead-followup does after a follow-up send
//   - open follow-up tasks are completed — tasks with source IN
//     ('drip_checkin', 'lead_followup') still 'pending', the exact
//     filter the note-add flow and /api/lead-followup use
//   - a lead_activity row (type 'email_sent') so it shows in the
//     lead's Activity feed, and a Notes entry whose text says
//     truthfully how the follow-up happened

import type { SupabaseClient } from '@supabase/supabase-js';

export type LeadContactSource = 'sent_mail' | 'manual';

export const LEAD_CONTACT_NOTE: Record<LeadContactSource, string> = {
  sent_mail:
    'Follow-up email sent from personal Outlook (recognized from Sent Items)',
  manual: 'Follow-up marked done — sent from personal email',
};

// YYYY-MM-DD in America/Toronto for a given instant.
export function torontoDateString(d: Date): string {
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

// Toronto calendar date of `d`, plus `days`, as YYYY-MM-DD.
export function torontoDatePlus(d: Date, days: number): string {
  const base = new Date(torontoDateString(d) + 'T12:00:00Z');
  base.setUTCDate(base.getUTCDate() + days);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const day = String(base.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export interface StampLeadContactedResult {
  statusBefore: string;
  statusAfter: string;
  lastContactedWritten: boolean;
  nextFollowupDate: string;
  tasksCompleted: number;
  activityLogged: boolean;
  noteWritten: boolean;
}

export async function stampLeadContacted(
  supabase: SupabaseClient,
  opts: {
    accountId: string;
    lead: { id: string; status: string };
    contactedAt: Date;
    source: LeadContactSource;
    // The team member who marked it done (manual), or null when Rea
    // recognized it (agent hook) — null renders as "System", the same
    // convention /api/admin/lead-reply uses.
    userId: string | null;
  }
): Promise<StampLeadContactedResult> {
  const { accountId, lead, contactedAt, source, userId } = opts;
  const contactedIso = contactedAt.toISOString();
  const statusBefore = lead.status as string;

  // Stamp last_contacted_at (its own update, like lead-reply, so a
  // surprise schema problem here can never block the rest).
  let lastContactedWritten = true;
  const { error: stampError } = await supabase
    .from('leads')
    .update({ last_contacted_at: contactedIso })
    .eq('id', lead.id);
  if (stampError) {
    lastContactedWritten = false;
  }

  // Status + next follow-up: 'New' becomes 'Contacted', and the next
  // follow-up lands 7 days after this contact.
  const nextFollowupDate = torontoDatePlus(contactedAt, 7);
  const updates: Record<string, string> = {
    next_followup_date: nextFollowupDate,
  };
  if (statusBefore === 'New') {
    updates.status = 'Contacted';
  }
  const { error: updateError } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', lead.id);
  if (updateError) throw updateError;

  // Complete any open follow-up tasks for the lead (same filter as
  // the note-add flow and /api/lead-followup).
  let tasksCompleted = 0;
  const { data: completedTasks, error: taskError } = await supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('lead_id', lead.id)
    .in('source', ['drip_checkin', 'lead_followup'])
    .eq('status', 'pending')
    .select('id');
  if (!taskError && completedTasks) {
    tasksCompleted = completedTasks.length;
  }

  // Activity log (best-effort; renders as "Follow-up email sent").
  let activityLogged = true;
  const { error: activityError } = await supabase.from('lead_activity').insert({
    lead_id: lead.id,
    account_id: accountId,
    user_id: userId,
    type: 'email_sent',
    metadata: {
      source,
      contacted_at: contactedIso,
      via: source === 'sent_mail' ? 'personal_outlook' : 'marked_done',
    },
  });
  if (activityError) {
    activityLogged = false;
  }

  // Note with the truthful wording (best-effort — the stamp above is
  // the record that matters).
  let noteWritten = true;
  const { error: noteError } = await supabase.from('notes').insert({
    lead_id: lead.id,
    account_id: accountId,
    user_id: userId,
    content: LEAD_CONTACT_NOTE[source],
  });
  if (noteError) {
    noteWritten = false;
  }

  return {
    statusBefore,
    statusAfter: updates.status || statusBefore,
    lastContactedWritten,
    nextFollowupDate,
    tasksCompleted,
    activityLogged,
    noteWritten,
  };
}

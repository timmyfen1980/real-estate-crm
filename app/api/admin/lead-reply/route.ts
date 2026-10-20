/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/lead-reply — inbound lead reply detection hook.
// Auth: Bearer REA_AGENT_SECRET.
// POST { email: string, replied_at: string } -> an email from a lead
// came back in (detected by Rea's inbox watching). For the matched
// contact's most recent non-terminal lead (not Closed — the DB
// lead_status enum has no 'Lost' value; filtering on it errors):
//   - last_contacted_at is stamped with the reply time
//   - status 'New' becomes 'Contacted' (other statuses untouched — a
//     reply is contact, not conversion)
//   - a future next_followup_date is pulled in to today (Toronto):
//     the follow-up is due now, not on the old schedule
//   - a lead_activity row (type 'reply_received', user = System) is
//     logged so the reply shows in the lead's history
// No matching contact or lead is NOT an error: { matched: false }.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

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

// Escape LIKE/ILIKE wildcards so the email is matched literally.
function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = typeof body?.email === 'string' ? body.email.trim() : '';
    const repliedRaw = typeof body?.replied_at === 'string' ? body.replied_at : '';
    if (!emailRaw || emailRaw.indexOf('@') < 0) {
      return NextResponse.json(
        { error: 'Body must include a valid email.' },
        { status: 400 }
      );
    }
    const repliedDate = new Date(repliedRaw);
    if (!repliedRaw || Number.isNaN(repliedDate.getTime())) {
      return NextResponse.json(
        { error: 'Body must include a valid replied_at timestamp.' },
        { status: 400 }
      );
    }
    const repliedIso = repliedDate.toISOString();
    const email = emailRaw.toLowerCase();

    const supabase = db();

    // Contact by email (account-scoped, case-insensitive).
    const { data: contacts, error: contactError } = await supabase
      .from('contacts')
      .select('id')
      .eq('account_id', ACCOUNT_ID)
      .ilike('email', escapeIlike(email))
      .limit(1);
    if (contactError) throw contactError;
    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ matched: false });
    }
    const contactId = contacts[0].id;

    // Most recent non-terminal lead for that contact.
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select('id, status, next_followup_date')
      .eq('account_id', ACCOUNT_ID)
      .eq('contact_id', contactId)
      .neq('status', 'Closed')
      .order('created_at', { ascending: false })
      .limit(1);
    if (leadError) throw leadError;
    if (!leadData || leadData.length === 0) {
      return NextResponse.json({ matched: false, contact_matched: true });
    }
    const lead = leadData[0];
    const statusBefore = lead.status as string;

    // Stamp last_contacted_at (its own update so a surprise schema
    // problem here can never block the status/follow-up changes).
    let lastContactedWritten = true;
    const { error: stampError } = await supabase
      .from('leads')
      .update({ last_contacted_at: repliedIso })
      .eq('id', lead.id);
    if (stampError) {
      lastContactedWritten = false;
    }

    // Status + follow-up changes.
    const updates: Record<string, string> = {};
    if (statusBefore === 'New') {
      updates.status = 'Contacted';
    }
    let followupMoved = false;
    if (lead.next_followup_date) {
      const followupMs = new Date(lead.next_followup_date).getTime();
      if (!Number.isNaN(followupMs) && followupMs > Date.now()) {
        updates.next_followup_date = torontoDateString(new Date());
        followupMoved = true;
      }
    }
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', lead.id);
      if (updateError) throw updateError;
    }

    // Activity log (best-effort; user null renders as "System").
    let activityLogged = true;
    const { error: activityError } = await supabase.from('lead_activity').insert({
      lead_id: lead.id,
      account_id: ACCOUNT_ID,
      user_id: null,
      type: 'reply_received',
      metadata: { replied_at: repliedIso },
    });
    if (activityError) {
      activityLogged = false;
    }

    return NextResponse.json({
      matched: true,
      contact_id: contactId,
      lead_id: lead.id,
      status_before: statusBefore,
      status_after: updates.status || statusBefore,
      last_contacted_at_written: lastContactedWritten,
      followup_moved: followupMoved,
      activity_logged: activityLogged,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Reply hook failed.' },
      { status: 500 }
    );
  }
}

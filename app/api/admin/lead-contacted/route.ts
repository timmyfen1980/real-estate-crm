/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/lead-contacted — outbound follow-up recognition hook.
// Auth: Bearer REA_AGENT_SECRET (same secret as /api/admin/lead-reply).
// POST { email: string, contacted_at: string,
//        source: 'sent_mail' | 'manual' }
// -> a follow-up with a lead happened OUTSIDE the CRM: Tim emailed
// them from his own Outlook (Rea's mail watching saw it in his Sent
// Items), or a team member marked it done by hand. For the matched
// contact's most recent non-terminal lead (not Closed — same rule as
// the inbound reply hook), lib/leadContacted.ts stamps the lead:
//   - last_contacted_at = the time the follow-up was sent
//   - status 'New' becomes 'Contacted'
//   - next_followup_date moves to 7 days after the follow-up
//   - open follow-up tasks (drip check-ins / lead follow-ups) are
//     completed, a lead_activity row is logged, and a Notes entry
//     records truthfully how the follow-up happened
// No matching contact or lead is NOT an error: { matched: false }.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stampLeadContacted } from '@/lib/leadContacted';
import type { LeadContactSource } from '@/lib/leadContacted';

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
    const contactedRaw = typeof body?.contacted_at === 'string' ? body.contacted_at : '';
    const sourceRaw = typeof body?.source === 'string' ? body.source : 'sent_mail';
    if (!emailRaw || emailRaw.indexOf('@') < 0) {
      return NextResponse.json(
        { error: 'Body must include a valid email.' },
        { status: 400 }
      );
    }
    const contactedDate = new Date(contactedRaw);
    if (!contactedRaw || Number.isNaN(contactedDate.getTime())) {
      return NextResponse.json(
        { error: 'Body must include a valid contacted_at timestamp.' },
        { status: 400 }
      );
    }
    if (sourceRaw !== 'sent_mail' && sourceRaw !== 'manual') {
      return NextResponse.json(
        { error: "Body source must be 'sent_mail' or 'manual'." },
        { status: 400 }
      );
    }
    const source = sourceRaw as LeadContactSource;
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
      .select('id, status')
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

    const result = await stampLeadContacted(supabase, {
      accountId: ACCOUNT_ID,
      lead: { id: lead.id, status: lead.status as string },
      contactedAt: contactedDate,
      source,
      userId: null,
    });

    return NextResponse.json({
      matched: true,
      source,
      contact_id: contactId,
      lead_id: lead.id,
      status_before: result.statusBefore,
      status_after: result.statusAfter,
      last_contacted_at_written: result.lastContactedWritten,
      next_followup_date: result.nextFollowupDate,
      tasks_completed: result.tasksCompleted,
      activity_logged: result.activityLogged,
      note_written: result.noteWritten,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Contacted hook failed.' },
      { status: 500 }
    );
  }
}

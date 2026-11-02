/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/leads/[id]/followup-done — the lead page's "Follow-up
// done — sent from my email" button. Session-auth: a signed-in team
// member says they already followed up with this lead from their own
// email (outside the CRM), so the lead is stamped contacted exactly
// as if the follow-up had been sent from inside the CRM — see
// lib/leadContacted.ts (source 'manual', actor = this user):
// last_contacted_at stamped, 'New' becomes 'Contacted', next
// follow-up set 7 days out, open follow-up tasks completed, an
// activity row logged, and a Notes entry recording that the
// follow-up was marked done by hand.
// This route NEVER sends an email — it only records one that the
// user says already happened.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stampLeadContacted } from '@/lib/leadContacted';

async function requireUser() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user;
}

function serviceDb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }
    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: 'Lead id is required.' }, { status: 400 });
    }

    const supabase = serviceDb();

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id, role')
      .eq('user_id', user.id)
      .single();
    if (!membership?.account_id) {
      return NextResponse.json({ error: 'No account found.' }, { status: 400 });
    }
    const accountId = membership.account_id;

    const { data: lead } = await supabase
      .from('leads')
      .select('id, account_id, status')
      .eq('id', leadId)
      .single();
    if (!lead || lead.account_id !== accountId) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const contactedAt = new Date();
    const result = await stampLeadContacted(supabase, {
      accountId,
      lead: { id: lead.id, status: lead.status as string },
      contactedAt,
      source: 'manual',
      userId: user.id,
    });

    return NextResponse.json({
      ok: true,
      lead_id: lead.id,
      last_contacted_at: contactedAt.toISOString(),
      last_contacted_at_written: result.lastContactedWritten,
      next_followup_date: result.nextFollowupDate,
      status_after: result.statusAfter,
      tasks_completed: result.tasksCompleted,
      activity_logged: result.activityLogged,
      note_written: result.noteWritten,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Server error.' },
      { status: 500 }
    );
  }
}

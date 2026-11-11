/* eslint-disable @typescript-eslint/no-explicit-any */
// GET /api/demo/enter — the practice-demo door (Help & Training page).
// Tim's model (2026-11-11): the "demo" is a TRAINING sandbox — a new
// user learns the CRM in a seeded practice copy before starting on
// their real book. The practice data lives in a separate account,
// "Demo Realty Group", whose broker login is demo@thefcgroup.ca
// (Dana Mercer). A signed-in team member tapping "Enter the practice
// demo" is handed a one-time magic link for that demo login and lands
// on the dashboard inside the practice account. Their own session is
// replaced (not merged) — signing out and back in as themselves
// returns them to their real account, untouched.
//
// Why not membership-based account switching: every page in the CRM
// resolves the user's account with account_users .single(), so a user
// holding two memberships would break resolution everywhere. A
// full multi-account refactor is productization work for later; this
// door needs no schema or page changes and cannot disturb the real
// account.
//
// Session-gated: only a signed-in CRM user can mint the demo link.
// The demo account itself is send-safe (all contacts @example.com,
// do_not_contact, zero drip enrollments).

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const DEMO_EMAIL = 'demo@thefcgroup.ca';
const DEMO_REDIRECT = 'https://crm.thefcgroup.ca/dashboard';

export async function GET() {
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

  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Sign in first, then enter the practice demo.' },
      { status: 401 }
    );
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: DEMO_EMAIL,
    options: { redirectTo: DEMO_REDIRECT },
  });

  // The auth API returns action_link at the top level of its raw
  // response; supabase-js lifts it into data.properties. Accept either
  // shape so a library version change can't silently break the door.
  const actionLink = ((data as any)?.properties?.action_link ??
    (data as any)?.action_link) as string | undefined;
  if (error || !actionLink) {
    return NextResponse.json(
      { ok: false, error: 'Could not open the practice demo — please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.redirect(actionLink);
}

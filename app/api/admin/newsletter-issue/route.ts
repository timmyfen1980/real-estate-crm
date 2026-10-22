/* eslint-disable @typescript-eslint/no-explicit-any */
// GET/POST /api/admin/newsletter-issue — session-auth issue status + approve
// for the Monthly Homeowner Newsletter (powers the panel on the campaign
// detail page). GET returns the current/next issue approval status; POST
// { issue: 'YYYY-MM' } records the approval and resumes paused enrollments.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getIssueStatus, approveIssue, skipIssue } from '@/lib/newsletterIssue';

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

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }
    return NextResponse.json(await getIssueStatus(serviceDb()));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const issue = typeof body.issue === 'string' ? body.issue : '';
    const action = typeof body.action === 'string' ? body.action : 'approve';
    const supabase = serviceDb();
    if (action === 'skip') {
      await skipIssue(supabase, issue);
      return NextResponse.json({
        skipped: true,
        issue,
        issue_status: await getIssueStatus(supabase),
      });
    }
    const result = await approveIssue(
      supabase,
      issue,
      user.email || 'crm-user'
    );
    return NextResponse.json({
      approved: true,
      issue,
      enrollments_resumed: result.resumed,
      issue_status: await getIssueStatus(supabase),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

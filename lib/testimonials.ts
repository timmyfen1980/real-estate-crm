/* eslint-disable @typescript-eslint/no-explicit-any */
// Testimonials — one home for every client review.
//
// Clients leave ONE review on thefcgroup.ca/testimonials; it lands in
// the testimonials table as 'pending' and shows on the website once a
// team member approves it in the CRM. The team can also add reviews by
// hand (e.g. pasted from Google), hide them, or delete them, and share
// any testimonial to social media as a branded quote graphic.
//
// GOOGLE NOTE: a Google review can only ever be posted by the reviewer,
// from their own Google account — there is no way to push a testimonial
// into Google. The website's thank-you screen therefore hands the
// client a copy-and-post button for Google instead.

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FC_ACCOUNT_ID } from '@/lib/contractorHours';

export { FC_ACCOUNT_ID };

export const TESTIMONIALS_PAGE_URL = 'https://www.thefcgroup.ca/testimonials';
export const GOOGLE_REVIEW_URL =
  'https://www.google.com/maps/search/?api=1&query=Fennessey+Comeau+Group+Whitby';

export interface TestimonialContext {
  userId: string;
  role: string;
  isOwner: boolean;
  supabase: SupabaseClient;
}

export type TestimonialAuthResult =
  | { ok: true; ctx: TestimonialContext }
  | { ok: false; response: NextResponse };

// Any FC Group team member (owner or member) may manage testimonials.
export async function requireTeamAccess(): Promise<TestimonialAuthResult> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }),
    };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: membership, error: membershipError } = await supabase
    .from('account_users')
    .select('account_id, role')
    .eq('user_id', user.id)
    .eq('account_id', FC_ACCOUNT_ID)
    .single();

  if (membershipError || !membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No access to this account.' },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      role: membership.role,
      isOwner: membership.role === 'owner',
      supabase,
    },
  };
}

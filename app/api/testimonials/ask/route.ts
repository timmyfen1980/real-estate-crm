/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/testimonials/ask — send the "please leave us a review" email.
// Session auth (any FC Group team member). Body: { name, email }.
// The email uses the standard branded template and carries ONE call to
// action: the testimonials page, where the client leaves a single review
// (and is offered a copy-and-post button for Google on the thank-you
// screen — Google reviews can only be posted by the reviewer).

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildEmailTemplate } from '@/lib/emailTemplates';
import { FC_ACCOUNT_ID, TESTIMONIALS_PAGE_URL } from '@/lib/testimonials';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const to = String(body?.email || '').trim();
    if (!name || !to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json(
        { ok: false, error: 'A client name and a valid email are both required.' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Sender identity + branding for the standard template (best effort).
    let profile: any = null;
    let account: any = null;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone, agent_photo_url')
        .eq('id', user.id)
        .single();
      profile = data || null;
      const { data: acct } = await supabase
        .from('accounts')
        .select('team_logo_url, brokerage_logo_url, brokerage_name')
        .eq('id', FC_ACCOUNT_ID)
        .single();
      account = acct || null;
    } catch {
      // Branding is best-effort; the send itself matters.
    }

    const firstName = name.split(/\s+/)[0] || 'there';
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.thefcgroup.ca';
    const subject = 'Would you leave us a quick review?';
    const html = buildEmailTemplate({
      content:
        '<p>Thank you for trusting the Fennessey Comeau Group with your move — it was a pleasure working with you.</p>' +
        '<p>If you have 30 seconds, a short review means the world to a local team like ours. Tap the button below and tell us how it went — that one review is all we need, and it shows right on our testimonials page.</p>' +
        '<p>Thank you again for your support.</p>',
      firstName,
      agentName: profile?.full_name || 'Fennessey Comeau Group',
      agentEmail: user.email,
      agentPhone: profile?.phone || '905 493-7355',
      agentPhoto: profile?.agent_photo_url || '',
      teamLogo: account?.team_logo_url || '',
      brokerageLogo: account?.brokerage_logo_url || '',
      brokerageName: account?.brokerage_name || 'RE/MAX HALLMARK FIRST GROUP REALTY LTD.',
      unsubscribeLink: site,
      ctaLink: `${TESTIMONIALS_PAGE_URL}#review`,
      ctaText: 'Leave a review',
      emailHeaderImage: `${site}/api/email-hero`,
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const sent: any = await resend.emails.send({
      from: 'The FC Group <info@thefcgroup.ca>',
      to,
      subject,
      html,
    });
    if (sent?.error) {
      throw new Error(sent.error.message || 'Email provider rejected the send');
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

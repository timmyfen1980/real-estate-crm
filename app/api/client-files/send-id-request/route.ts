/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/client-files/send-id-request — email the client a link to
// upload their photo ID through the client portal.
//
// Tim (2026-10-23): the client file page gets a SEND link for ID, not
// a copy-to-clipboard message. The team member clicks Send; the
// client gets the standard branded email with an "Upload your photo
// ID" button that opens their portal page. If the portal isn't
// enabled yet, sending enables it first.
//
// Auth: signed-in team member (session cookie).
// Body: { client_file_id }

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildEmailTemplate } from '@/lib/emailTemplates';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
    const clientFileId = body?.client_file_id;
    if (!clientFileId) {
      return NextResponse.json(
        { ok: false, error: 'client_file_id is required' },
        { status: 400 }
      );
    }

    const supabase = serviceClient();
    const { data: file, error: fileErr } = await supabase
      .from('client_files')
      .select('id, account_id, crm_contact_id, client_names, email, portal_token, portal_enabled')
      .eq('id', clientFileId)
      .single();
    if (fileErr || !file) {
      return NextResponse.json({ ok: false, error: 'Client file not found' }, { status: 404 });
    }

    let contact: any = null;
    if (file.crm_contact_id) {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email')
        .eq('id', file.crm_contact_id)
        .single();
      contact = data || null;
    }
    const to = String(contact?.email || file.email || '').trim();
    if (!to) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No email address on file for this client — add one in Contact Details, then send again.",
        },
        { status: 400 }
      );
    }

    // Portal must be live for the link to work — enable it as part of
    // the send if it isn't already.
    let token = file.portal_token as string | null;
    if (!token || !file.portal_enabled) {
      token = token || crypto.randomUUID().replace(/-/g, '');
      const { error: upErr } = await supabase
        .from('client_files')
        .update({ portal_token: token, portal_enabled: true })
        .eq('id', file.id);
      if (upErr) throw upErr;
    }
    const website = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://www.thefcgroup.ca';
    const link = `${website}/client/${token}`;

    // Sender identity + branding for the standard template — the
    // signed-in team member's profile and the account's logos, with
    // team defaults if a lookup comes back empty.
    let profile: any = null;
    let account: any = null;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, phone, agent_photo_url')
        .eq('id', user.id)
        .single();
      profile = data || null;
      const { data: membership } = await supabase
        .from('account_users')
        .select('account_id')
        .eq('user_id', user.id)
        .single();
      if (membership?.account_id) {
        const { data: acct } = await supabase
          .from('accounts')
          .select('team_logo_url, brokerage_logo_url, brokerage_name')
          .eq('id', membership.account_id)
          .single();
        account = acct || null;
      }
    } catch {
      // Branding is best-effort; the send itself matters.
    }

    const firstName =
      String(contact?.first_name || '').trim() ||
      String(file.client_names || '').trim().split(/\s+/)[0] ||
      'there';
    const subject = 'Photo ID needed for your file';
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.thefcgroup.ca';
    const html = buildEmailTemplate({
      content:
        '<p>We need a clear photo of your government-issued photo ID (driver&rsquo;s licence or passport) for your file.</p>' +
        '<p>Tap the button below to open your secure client page, then upload it under <strong>Government photo ID</strong> — a clear photo from your phone is fine.</p>',
      firstName,
      agentName: profile?.full_name || 'Fennessey Comeau Group',
      agentEmail: user.email,
      agentPhone: profile?.phone || '905 493-7355',
      agentPhoto: profile?.agent_photo_url || '',
      teamLogo: account?.team_logo_url || '',
      brokerageLogo: account?.brokerage_logo_url || '',
      brokerageName: account?.brokerage_name || 'RE/MAX HALLMARK FIRST GROUP REALTY LTD.',
      unsubscribeLink: file.crm_contact_id
        ? `${site}/api/unsubscribe?contact_id=${file.crm_contact_id}`
        : site,
      ctaLink: link,
      ctaText: 'Upload your photo ID',
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

    try {
      await supabase.from('email_logs').insert({
        account_id: file.account_id,
        contact_id: file.crm_contact_id,
        subject,
        body_html: html,
        status: 'sent',
        resend_id: sent?.data?.id || null,
      });
    } catch {
      // Logging is best-effort; the email already went out.
    }

    return NextResponse.json({ ok: true, sent_to: to });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Send failed' },
      { status: 500 }
    );
  }
}

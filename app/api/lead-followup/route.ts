/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/lead-followup — send a one-off follow-up email to a lead
// from inside the CRM (the "Follow up" button on leads + tasks).
// Session-auth: only a signed-in team member can send, and only for a
// lead in their account. The human clicking Send IS the sender — this
// route never sends on its own.
//
// On success it:
//   - logs the email (email_logs, status 'sent', with the Resend id)
//   - stamps the lead's last_contacted_at and sets the next follow-up
//     7 days out (Toronto)
//   - records lead_activity type 'email_sent'
//   - completes any open drip check-in tasks for the lead
// On failure it logs email_logs status 'failed' and returns the error
// honestly — the UI never pretends an email went out when it didn't.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const TEAM_PHONE = '905 493-7355';
const BROKERAGE = 'RE/MAX HALLMARK FIRST GROUP REALTY LTD.';

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function torontoTodayPlus(days: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const base = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00`);
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(
    base.getDate()
  ).padStart(2, '0')}`;
}

// Known team identities for the signature block. Anyone else falls back
// to the team identity (info@, no photo).
function agentIdentity(fullName: string | null, accountId: string) {
  const first = (fullName || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
  const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/account-assets/${accountId}/agents`;
  if (first === 'tim') {
    return {
      name: fullName as string,
      email: 'tim@thefcgroup.ca',
      photo: `${storageBase}/tim-headshot.jpg`,
    };
  }
  if (first === 'aidan') {
    return {
      name: fullName as string,
      email: 'aidan@thefcgroup.ca',
      photo: `${storageBase}/aidan-headshot.jpg`,
    };
  }
  if (first === 'beth') {
    return { name: fullName as string, email: 'beth@thefcgroup.ca', photo: null as string | null };
  }
  return {
    name: fullName || 'Fennessey Comeau Group',
    email: 'info@thefcgroup.ca',
    photo: null as string | null,
  };
}

function buildHtml(opts: {
  firstName: string;
  bodyText: string;
  heroUrl: string | null;
  agent: { name: string; email: string; photo: string | null };
}): string {
  const paragraphs = opts.bodyText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(
      p =>
        `<p style="margin:0 0 16px 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#e5e7eb; font-family: Arial, sans-serif;">
<center>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e5e7eb;">
<tr><td align="center" style="padding:40px 0;">
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; max-width:600px;">
    <tr><td height="10" style="background-color:#0f2a44; font-size:0; line-height:0;">&nbsp;</td></tr>
    ${
      opts.heroUrl
        ? `<tr><td><img src="${opts.heroUrl}" width="600" alt="" style="width:100%; max-width:600px; height:auto; display:block; border:0;" /></td></tr>`
        : ''
    }
    <tr><td height="10" style="background-color:#0f2a44; font-size:0; line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:30px 28px 32px; font-size:16px; line-height:1.6; color:#111111;">
      <p style="font-size:20px; margin:0 0 20px 0; font-weight:600;">Hi ${escapeHtml(opts.firstName)},</p>
      <div style="font-size:16px; line-height:1.8; color:#111111;">
        ${paragraphs}
      </div>
    </td></tr>
    <tr><td style="border-top:1px solid #eeeeee; padding:28px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          ${
            opts.agent.photo
              ? `<td valign="middle" style="padding-right:12px;"><img src="${opts.agent.photo}" width="28" height="28" alt="" style="width:28px; height:28px; display:block; border:0;" /></td>`
              : ''
          }
          <td valign="middle" style="font-size:15px; line-height:1.5; color:#111111;">
            <div style="font-weight:700; font-size:16px;">${escapeHtml(opts.agent.name)}</div>
            <div>${escapeHtml(opts.agent.email)}</div>
            <div>${TEAM_PHONE}</div>
            <div style="margin-top:4px; color:#555555;">${BROKERAGE}</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</td></tr>
</table>
</center>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const leadId = typeof body.lead_id === 'string' ? body.lead_id : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const bodyText = typeof body.body_text === 'string' ? body.body_text.trim() : '';
    const toOverride = typeof body.to === 'string' ? body.to.trim() : '';

    if (!leadId || !subject || !bodyText) {
      return NextResponse.json(
        { error: 'lead_id, subject and body_text are required.' },
        { status: 400 }
      );
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
      .select('id, account_id, contact_id, first_name, last_name, email, assigned_user_id')
      .eq('id', leadId)
      .single();
    if (!lead || lead.account_id !== accountId) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const to = toOverride || lead.email || '';
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json(
        { error: 'No valid email address for this lead.' },
        { status: 400 }
      );
    }

    // Signature identity: the lead's assigned agent, else the sender.
    const agentUserId = lead.assigned_user_id || user.id;
    const { data: agentProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', agentUserId)
      .maybeSingle();
    const agent = agentIdentity(agentProfile?.full_name || null, accountId);

    const { data: account } = await supabase
      .from('accounts')
      .select('email_header_image_url')
      .eq('id', accountId)
      .maybeSingle();
    const heroUrl =
      account?.email_header_image_url || 'https://crm.thefcgroup.ca/api/email-hero';

    const html = buildHtml({
      firstName: lead.first_name || 'there',
      bodyText,
      heroUrl,
      agent,
    });

    let resendId: string | null = null;
    try {
      const response = await resend.emails.send({
        from: `${agent.name} <info@thefcgroup.ca>`,
        to,
        replyTo: agent.email,
        subject,
        html,
        text: `Hi ${lead.first_name || 'there'},\n\n${bodyText}\n\n${agent.name}\n${agent.email}\n${TEAM_PHONE}\n${BROKERAGE}`,
      });
      if ((response as any)?.error) {
        throw new Error((response as any).error.message || 'Resend send failed.');
      }
      resendId = (response as any)?.data?.id || null;
    } catch (sendErr: any) {
      await supabase.from('email_logs').insert({
        account_id: accountId,
        contact_id: lead.contact_id,
        subject,
        body_html: html,
        status: 'failed',
      });
      return NextResponse.json(
        { error: sendErr.message || 'The email could not be sent.' },
        { status: 502 }
      );
    }

    await supabase.from('email_logs').insert({
      account_id: accountId,
      contact_id: lead.contact_id,
      subject,
      body_html: html,
      status: 'sent',
      resend_id: resendId,
    });

    const nextFollowup = torontoTodayPlus(7);
    await supabase
      .from('leads')
      .update({
        last_contacted_at: new Date().toISOString(),
        next_followup_date: nextFollowup,
      })
      .eq('id', lead.id);

    await supabase.from('lead_activity').insert([
      {
        lead_id: lead.id,
        account_id: accountId,
        user_id: user.id,
        type: 'email_sent',
        metadata: { subject, to, via: 'followup_button' },
      },
    ]);

    await supabase
      .from('tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('lead_id', lead.id)
      .eq('source', 'drip_checkin')
      .eq('status', 'pending');

    return NextResponse.json({ ok: true, next_followup_date: nextFollowup });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Server error.' },
      { status: 500 }
    );
  }
}

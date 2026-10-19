/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_FULL_API_KEY || process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    if (!process.env.RESEND_FULL_API_KEY) {
      return NextResponse.json({
        error: 'Full-access Resend API key not configured.'
      }, { status: 500 });
    }

    // Get dismissed emails (already handled by Tim) — filter these out
    let dismissedEmails = new Set<string>();
    try {
      const { data: dismissed } = await supabase
        .from('email_health_dismissed')
        .select('email');
      if (dismissed) {
        dismissedEmails = new Set(dismissed.map((d: any) => d.email.toLowerCase()));
      }
    } catch (e) {
      // Table may not exist yet — proceed without filtering
    }

    const { data, error } = await resend.emails.list({ limit: 100 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const emails = data?.data || [];
    const issues = [];
    const seenEmails = new Set<string>();

    for (const email of emails) {
      try {
        const { data: details } = await resend.emails.get(email.id);
        const lastEvent = (details as any)?.last_event;

        if (lastEvent === 'bounced' || lastEvent === 'complained' || lastEvent === 'failed') {
          const toEmail = Array.isArray(email.to) ? email.to[0] : email.to;
          const normalizedEmail = (toEmail || '').toLowerCase();

          // Skip if already dismissed by Tim
          if (dismissedEmails.has(normalizedEmail)) continue;

          // Skip duplicates (same email bounced multiple times — show once)
          if (seenEmails.has(normalizedEmail)) continue;
          seenEmails.add(normalizedEmail);

          // Look up the contact FIRST
          const { data: contacts } = await supabase
            .from('contacts')
            .select('id, first_name, last_name, email')
            .ilike('email', toEmail)
            .limit(1);

          const contact = contacts?.[0] || null;

          // No matching contact = deleted or never existed — skip it.
          // This handles: deleted contacts, and fixed emails (old address
          // no longer matches any contact after the fix).
          if (!contact) continue;

          issues.push({
            id: email.id,
            to: email.to,
            subject: email.subject,
            created_at: email.created_at,
            last_event: lastEvent,
            contact_id: contact.id,
            contact_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || null,
          });
        }
      } catch (e) {}
    }

    return NextResponse.json({ ok: true, issues, total_checked: emails.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

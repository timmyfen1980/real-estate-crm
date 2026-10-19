import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  try {
    // Fetch recent emails from Resend
    const { data, error } = await resend.emails.list({ limit: 100 });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter to bounced/failed and get details
    const emails = data?.data || [];
    const issues = [];

    for (const email of emails) {
      // Get full details for each email to see bounce reason
      try {
        const { data: details } = await resend.emails.get(email.id);
        const lastEvent = (details as any)?.last_event;
        
        if (lastEvent === 'bounced' || lastEvent === 'complained' || lastEvent === 'failed') {
          issues.push({
            id: email.id,
            to: email.to,
            subject: email.subject,
            created_at: email.created_at,
            last_event: lastEvent,
            // Resend doesn't always expose the bounce reason via API,
            // but we capture what we can
          });
        }
      } catch (e) {
        // Skip if can't get details
      }
    }

    return NextResponse.json({ ok: true, issues, total_checked: emails.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Use full-access key for reading email data (send-only key can't list emails)
const resend = new Resend(process.env.RESEND_FULL_API_KEY || process.env.RESEND_API_KEY);

export async function GET() {
  try {
    if (!process.env.RESEND_FULL_API_KEY) {
      return NextResponse.json({ 
        error: 'Full-access Resend API key not configured. Add RESEND_FULL_API_KEY to Vercel env vars.' 
      }, { status: 500 });
    }

    const { data, error } = await resend.emails.list({ limit: 100 });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const emails = data?.data || [];
    const issues = [];

    for (const email of emails) {
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

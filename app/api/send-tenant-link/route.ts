import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const BETH_EMAIL = 'beth@thefcgroup.ca';
const PORTAL_URL = 'https://www.thefcgroup.ca/client/tenant-apply';

function buildEmailHtml(name: string, property: string, agent: string): string {
  const locationLine = property
    ? `looking at <strong>${property}</strong>`
    : `looking for a rental`;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;">
<div style="background:#0f2a44;padding:24px;text-align:center;">
<span style="color:#ffffff;font-size:22px;font-weight:bold;">FENNESSEY COMEAU GROUP</span>
</div>
<div style="padding:32px 28px;color:#333333;font-size:15px;line-height:1.6;">
<p>Hi ${name},</p>
<p>${agent} passed along that you're ${locationLine}.</p>
<p>Before we book any showings, we ask every prospective tenant to complete our quick pre-screening process. It only takes a few minutes and it means we can move fast when the right place comes up.</p>
<p style="text-align:center;margin:28px 0;">
<a href="${PORTAL_URL}" style="display:inline-block;background:#d22630;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:16px;">Start My Application</a>
</p>
<p>Here's what you'll need:</p>
<ol>
<li>Create your file (name, email, phone)</li>
<li>Fill out the rental application online</li>
<li>Upload a clear photo of your government ID</li>
<li>Upload your credit report (Equifax, Borrowell, or Credit Karma — must show your name and score)</li>
<li>Upload your employment letter and two most recent pay stubs</li>
</ol>
<p>Once everything is in, we'll review it and be in touch to book showings.</p>
<p>Thanks,<br/>
<strong>Beth</strong><br/>
Fennessey Comeau Group | RE/MAX Hallmark First Group Realty Ltd.<br/>
<a href="mailto:${BETH_EMAIL}">${BETH_EMAIL}</a> | 905 493-7355</p>
</div>
<div style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#888888;">
Fennessey Comeau Group, RE/MAX Hallmark First Group Realty Ltd.
</div>
</div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    // Verify the user is logged in
    const cookieStore = cookies();
    const supabase = createServerClient(
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const body = await req.json();
    const name = (body.name || '').trim();
    const email = (body.email || '').trim();
    const property = (body.property || '').trim();
    const agent = (body.agent || 'Tim').trim();

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: 'Email service not configured.' }, { status: 500 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Beth <${BETH_EMAIL}>`,
        to: [email],
        subject: 'Before we book your showing — quick step from the FC Group',
        html: buildEmailHtml(name, property, agent),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Email failed: ${errText}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Something went wrong.' },
      { status: 500 }
    );
  }
}

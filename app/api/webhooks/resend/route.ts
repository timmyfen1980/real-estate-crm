import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const JUNK_PATTERNS = [
  /^rtest@/i,
  /^test@/i,
  /^t@ff\.cx$/i,
  /@fenn\.ca$/i,
  /^.*@example\./i,
];

function isJunkEmail(email: string): boolean {
  return JUNK_PATTERNS.some(p => p.test(email));
}

function verifySignature(payload: string, signature: string | null): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // Skip verification if no secret configured
  if (!signature) return false;
  
  // Resend uses Svix-style signatures: "v1,<signature>"
  const parts = signature.split(',');
  const sig = parts.find(p => p.startsWith('v1='))?.slice(3) || parts[0];
  
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    
    // Verify webhook signature
    const signature = request.headers.get('svix-signature') || request.headers.get('webhook-signature');
    if (process.env.RESEND_WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    const body = JSON.parse(rawBody);
    const { type, data } = body;
    
    if (!type || !data) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    const email = Array.isArray(data.to) ? data.to[0] : data.to;
    if (!email) {
      return NextResponse.json({ ok: true, skipped: 'no email' });
    }

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email')
      .ilike('email', email);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ ok: true, skipped: 'contact not found' });
    }

    const ids = contacts.map((c: any) => c.id);
    let action = '';

    if (type === 'email.complained' || type === 'email.suppressed') {
      await supabase.from('contacts').update({ 
        email_invalid: true,
        email_invalid_reason: type === 'email.complained' ? 'spam_complaint' : 'suppressed',
        email_invalid_at: new Date().toISOString(),
      }).in('id', ids);
      action = type === 'email.complained' ? 'flagged_spam_complaint' : 'flagged_suppressed';
      
    } else if (type === 'email.bounced' || type === 'email.failed') {
      if (isJunkEmail(email)) {
        await supabase.from('contact_campaigns').delete().in('contact_id', ids);
        await supabase.from('email_logs').delete().in('contact_id', ids);
        await supabase.from('contacts').delete().in('id', ids);
        action = 'deleted_junk';
      } else {
        await supabase.from('contacts').update({ 
          email_invalid: true,
          email_invalid_reason: type === 'email.bounced' ? 'bounced' : 'failed',
          email_invalid_at: new Date().toISOString(),
        }).in('id', ids);
        action = 'flagged_bounced';
      }
    } else {
      return NextResponse.json({ ok: true, skipped: 'unhandled event type' });
    }

    return NextResponse.json({ ok: true, action, email, contacts_affected: ids.length });
    
  } catch (err: any) {
    console.error('Resend webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Resend webhook endpoint' });
}

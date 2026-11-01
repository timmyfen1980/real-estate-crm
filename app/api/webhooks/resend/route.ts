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

function verifySignature(payload: string, msgId: string | null, timestamp: string | null, signature: string | null): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true; // Skip verification if no secret configured
  if (!msgId || !timestamp || !signature) return false;

  // Svix (Resend) verification: the key is the base64 part of the "whsec_" secret,
  // the signed content is "<msg id>.<timestamp>.<raw body>", and the signature
  // header carries one or more space-separated "v1,<base64 signature>" entries.
  let key: Buffer;
  try {
    key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  } catch {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${msgId}.${timestamp}.${payload}`)
    .digest();

  const candidates = signature
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => (part.includes(',') ? part.slice(part.indexOf(',') + 1) : part));

  return candidates.some(candidate => {
    let actual: Buffer;
    try {
      actual = Buffer.from(candidate, 'base64');
    } catch {
      return false;
    }
    // Length check first: timingSafeEqual throws on unequal lengths (that throw
    // was the 500 "Input buffers must have the same byte length" Resend kept hitting).
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    
    // Verify webhook signature
    const msgId = request.headers.get('svix-id');
    const timestamp = request.headers.get('svix-timestamp');
    const signature = request.headers.get('svix-signature') || request.headers.get('webhook-signature');
    if (process.env.RESEND_WEBHOOK_SECRET && !verifySignature(rawBody, msgId, timestamp, signature)) {
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

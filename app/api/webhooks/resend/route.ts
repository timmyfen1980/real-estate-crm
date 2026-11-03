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

// Toronto calendar date (YYYY-MM-DD) for a timestamp — stamped into the
// "Email cleared" contact notes below.
function torontoDate(iso?: string | null): string {
  const parsed = iso ? new Date(iso) : new Date();
  const d = isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// Note an email clearing on each contact (Tim, 2026-11-03: every clear
// gets a note saying which and when). Best-effort — a failed note must
// never fail the webhook. Authored by the contact's assigned user: the
// notes table only accepts real users, and the wording makes the
// system origin plain. Idempotency: once a contact's email is cleared,
// later events for that address no longer match the contact by email,
// so a duplicate note cannot be written.
async function noteEmailCleared(contacts: any[], word: string, eventDate: string) {
  const content = `Email cleared \u2014 address ${word} (Resend, ${eventDate})`;
  for (const c of contacts) {
    if (!c.assigned_user_id) continue;
    const { error } = await supabase.from('notes').insert({
      contact_id: c.id,
      user_id: c.assigned_user_id,
      content,
    });
    if (error) console.error('Email-cleared note failed:', error.message);
  }
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
    const eventDate = torontoDate(typeof body?.created_at === 'string' ? body.created_at : null);
    
    if (!type || !data) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    const email = Array.isArray(data.to) ? data.to[0] : data.to;
    if (!email) {
      return NextResponse.json({ ok: true, skipped: 'no email' });
    }

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email, assigned_user_id')
      .ilike('email', email);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ ok: true, skipped: 'contact not found' });
    }

    const ids = contacts.map((c: any) => c.id);
    let action = '';

    if (type === 'email.complained' || type === 'email.suppressed') {
      // Tim (2026-11-03): a suppressed/complained address is dead — clear
      // it from the contact (the contact itself stays) and note the clear,
      // mirroring the suppression sweep. Flag fields unchanged.
      await supabase.from('contacts').update({ 
        email: null,
        email_invalid: true,
        email_invalid_reason: type === 'email.complained' ? 'spam_complaint' : 'suppressed',
        email_invalid_at: new Date().toISOString(),
      }).in('id', ids);
      await noteEmailCleared(contacts, type === 'email.complained' ? 'suppressed (spam complaint)' : 'suppressed', eventDate);
      action = type === 'email.complained' ? 'flagged_spam_complaint' : 'flagged_suppressed';
      
    } else if (type === 'email.bounced' || type === 'email.failed') {
      if (isJunkEmail(email)) {
        await supabase.from('contact_campaigns').delete().in('contact_id', ids);
        await supabase.from('email_logs').delete().in('contact_id', ids);
        await supabase.from('contacts').delete().in('id', ids);
        action = 'deleted_junk';
      } else if (type === 'email.bounced') {
        // Tim (2026-11-03): a bounced address is dead — clear it from the
        // contact (the contact itself stays) and note the clear, same as
        // the suppression sweep.
        await supabase.from('contacts').update({ 
          email: null,
          email_invalid: true,
          email_invalid_reason: 'bounced',
          email_invalid_at: new Date().toISOString(),
        }).in('id', ids);
        await noteEmailCleared(contacts, 'bounced', eventDate);
        action = 'flagged_bounced';
      } else {
        await supabase.from('contacts').update({ 
          email_invalid: true,
          email_invalid_reason: 'failed',
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

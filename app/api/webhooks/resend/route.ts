import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Obvious junk patterns - auto-delete these contacts
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Resend webhook format: { type: 'email.bounced', data: { email_id, to, ... } }
    const { type, data } = body;
    
    if (!type || !data) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    const email = Array.isArray(data.to) ? data.to[0] : data.to;
    if (!email) {
      return NextResponse.json({ ok: true, skipped: 'no email' });
    }

    // Find the contact
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email')
      .ilike('email', email);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ ok: true, skipped: 'contact not found' });
    }

    const ids = contacts.map((c: any) => c.id);
    let action = '';

    if (type === 'email.complained') {
      // Spam complaint - must suppress. Flag as invalid.
      await supabase.from('contacts').update({ 
        email_invalid: true,
        email_invalid_reason: 'spam_complaint',
        email_invalid_at: new Date().toISOString(),
      }).in('id', ids);
      action = 'flagged_spam_complaint';
      
    } else if (type === 'email.bounced') {
      if (isJunkEmail(email)) {
        // Obvious junk - delete the contact entirely
        await supabase.from('contact_campaigns').delete().in('contact_id', ids);
        await supabase.from('email_logs').delete().in('contact_id', ids);
        await supabase.from('contacts').delete().in('id', ids);
        action = 'deleted_junk';
      } else {
        // Real email that bounced - flag for review
        await supabase.from('contacts').update({ 
          email_invalid: true,
          email_invalid_reason: 'bounced',
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

// Resend requires a GET for webhook verification
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Resend webhook endpoint' });
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Record an email as dismissed so it doesn't reappear in health checks
async function dismissEmail(email: string, action: string, notes?: string) {
  try {
    await supabase.from('email_health_dismissed').upsert(
      {
        email: email.toLowerCase(),
        action,
        notes: notes || null,
      },
      { onConflict: 'email' }
    );
  } catch (e) {
    // Table may not exist yet — log but don't fail the action
    console.error('Failed to record dismissed email:', e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, action } = await request.json();

    if (!email || !action) {
      return NextResponse.json({ error: 'Missing email or action' }, { status: 400 });
    }

    if (action === 'delete') {
      // Find and delete the contact
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id')
        .ilike('email', email);

      if (!contacts || contacts.length === 0) {
        // Contact already gone — still dismiss the email so it doesn't reappear
        await dismissEmail(email, 'deleted', 'Contact not found (already deleted)');
        return NextResponse.json({ ok: true, deleted: 0, note: 'Contact already deleted, email dismissed' });
      }

      const ids = contacts.map((c: any) => c.id);

      // Clean up related records
      await supabase.from('contact_campaigns').delete().in('contact_id', ids);
      await supabase.from('email_logs').delete().in('contact_id', ids);
      await supabase.from('contacts').delete().in('id', ids);

      // Dismiss so the historical bounce doesn't reappear
      await dismissEmail(email, 'deleted', `Deleted ${ids.length} contact(s)`);

      return NextResponse.json({ ok: true, deleted: ids.length });
    }

    if (action.startsWith('fix:')) {
      const newEmail = action.slice(4);
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id')
        .ilike('email', email);

      if (!contacts || contacts.length === 0) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      }

      const ids = contacts.map((c: any) => c.id);
      await supabase.from('contacts').update({ email: newEmail }).in('id', ids);

      // Dismiss the OLD email so its historical bounce doesn't reappear
      await dismissEmail(email, 'fixed', `Fixed to ${newEmail}`);

      return NextResponse.json({ ok: true, updated: ids.length });
    }

    if (action === 'dismiss') {
      // Tim verified the email is fine — dismiss the historical bounce
      await dismissEmail(email, 'dismissed', 'Manually verified/dismissed by Tim');
      return NextResponse.json({ ok: true, dismissed: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      }
      
      const ids = contacts.map((c: any) => c.id);
      
      // Clean up related records
      await supabase.from('contact_campaigns').delete().in('contact_id', ids);
      await supabase.from('email_logs').delete().in('contact_id', ids);
      await supabase.from('contacts').delete().in('id', ids);
      
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
      
      return NextResponse.json({ ok: true, updated: ids.length });
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

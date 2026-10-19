/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/admin/find-contacts — one-time admin lookup.
// Body: { search }
// Returns matching contacts with id, names, email, phone, created_at.
// Protected: requires a valid Supabase session (any logged-in CRM user).

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const search = (body.search || '').trim();
    if (!search) {
      return NextResponse.json({ error: 'Search term required.' }, { status: 400 });
    }

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, phone, created_at, notes')
      .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) throw error;

    // For each contact, count related records
    const results = [];
    for (const c of contacts || []) {
      const [campaigns, logs] = await Promise.all([
        supabase.from('contact_campaigns').select('id', { count: 'exact', head: true }).eq('contact_id', c.id),
        supabase.from('email_logs').select('id', { count: 'exact', head: true }).eq('contact_id', c.id),
      ]);
      results.push({
        ...c,
        campaign_count: campaigns.count || 0,
        email_log_count: logs.count || 0,
      });
    }

    return NextResponse.json({ ok: true, contacts: results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

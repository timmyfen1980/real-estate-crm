/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/admin/find-contacts — one-time admin lookup.
// Body: { search }
// Auth: Bearer REA_AGENT_SECRET header.
// Returns matching contacts with id, names, email, phone, created_at.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token !== process.env.REA_AGENT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
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

    // Build OR conditions: match against first_name, last_name, email
    // Also handle "First Last" by splitting into parts
    const parts = search.split(/\s+/).filter((p: string) => p.length > 0);
    let orConditions = `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`;
    
    // If multiple words, also try first word as first_name + last word as last_name
    if (parts.length >= 2) {
      const firstPart = parts[0];
      const lastPart = parts[parts.length - 1];
      orConditions += `,and(first_name.ilike.%${firstPart}%,last_name.ilike.%${lastPart}%)`;
    }

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select("id, first_name, last_name, email, phone, created_at")
      .or(orConditions)
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) throw error;

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

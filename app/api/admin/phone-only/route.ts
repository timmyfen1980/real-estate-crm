/* eslint-disable @typescript-eslint/no-explicit-any */
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
    let allContacts: any[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email, phone')
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allContacts = allContacts.concat(data);
      if (data.length < 1000) break;
      page++;
      if (page > 20) break;
    }
    const phoneOnly = allContacts.filter(c => c.phone && !c.email);
    return NextResponse.json({
      ok: true,
      total: allContacts.length,
      phone_only_count: phoneOnly.length,
      phone_only: phoneOnly.map(c => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        phone: c.phone,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

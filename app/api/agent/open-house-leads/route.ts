import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET /api/agent/open-house-leads — read-only export of recent open house events
// with their signed-in leads, for Rea (Tim's agent) to build the Monday-morning
// post-open-house follow-up (visitors without agents -> calendar follow-ups).
// Bearer-gated with REA_AGENT_SECRET; returns event + lead info only.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') || '';
  const secret = process.env.REA_AGENT_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const days = Math.min(
    parseInt(request.nextUrl.searchParams.get('days') || '7', 10) || 7,
    30
  );
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: events, error: eventsError } = await supabase
    .from('open_house_events')
    .select('id, event_date, start_time, end_time, is_active, property_id')
    .gte('event_date', sinceStr)
    .order('event_date', { ascending: false });

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const eventList = events || [];
  const eventIds = eventList.map((e: any) => e.id);

  let addresses: Record<string, string> = {};
  const propertyIds = [...new Set(eventList.map((e: any) => e.property_id))];
  if (propertyIds.length) {
    const { data: props } = await supabase
      .from('properties')
      .select('id, address')
      .in('id', propertyIds);
    for (const p of props || []) addresses[p.id] = p.address;
  }

  let leads: any[] = [];
  if (eventIds.length) {
    const { data, error: leadsError } = await supabase
      .from('leads')
      .select(
        'id, first_name, last_name, email, phone, working_with_realtor, realtor_name, buyer_stage, hear_about, open_house_event_id, created_at'
      )
      .in('open_house_event_id', eventIds)
      .order('created_at', { ascending: true });
    if (leadsError) {
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }
    leads = data || [];
  }

  return NextResponse.json({
    events: eventList.map((e: any) => ({
      ...e,
      property_address: addresses[e.property_id] || null,
    })),
    leads,
  });
}

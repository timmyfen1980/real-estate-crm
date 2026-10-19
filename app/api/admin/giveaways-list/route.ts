/* eslint-disable @typescript-eslint/no-explicit-any */
// Session-authenticated proxy routes for giveaway management from dashboard.
// These verify the Supabase session, then use service role for DB access.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const FC_ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

async function getServiceClient() {
  const cookieStore = await cookies();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { cookie: cookieStore.toString() } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET /api/admin/giveaways-list — list all giveaways with entry counts
export async function GET(req: NextRequest) {
  try {
    const admin = await getServiceClient();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await admin
      .from('giveaways')
      .select('*')
      .eq('account_id', FC_ACCOUNT_ID)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const withCounts = await Promise.all(
      (data || []).map(async (g: any) => {
        const { count } = await admin
          .from('giveaway_entries')
          .select('id', { count: 'exact', head: true })
          .eq('giveaway_id', g.id);
        return { ...g, entry_count: count || 0 };
      })
    );

    return NextResponse.json({ giveaways: withCounts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

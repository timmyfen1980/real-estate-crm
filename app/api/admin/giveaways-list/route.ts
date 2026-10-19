/* eslint-disable @typescript-eslint/no-explicit-any */
// GET /api/admin/giveaways-list — list all giveaways with entry counts (session auth).

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const FC_ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

export async function GET() {
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

    const { data, error } = await supabase
      .from('giveaways')
      .select('*')
      .eq('account_id', FC_ACCOUNT_ID)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const withCounts = await Promise.all(
      (data || []).map(async (g: any) => {
        const { count } = await supabase
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

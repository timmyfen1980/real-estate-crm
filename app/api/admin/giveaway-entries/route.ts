/* eslint-disable @typescript-eslint/no-explicit-any */
// GET /api/admin/giveaway-entries — count contacts with giveaway entries.
// Uses session auth (dashboard page).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            cookie: cookieStore.toString(),
          },
        },
      }
    );

    // Verify session
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service role for the count
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { count, error } = await adminSupabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .ilike('notes', '%giveaway entry%');

    if (error) throw error;
    return NextResponse.json({ count: count || 0 });
  } catch (err: any) {
    return NextResponse.json({ count: 0 });
  }
}

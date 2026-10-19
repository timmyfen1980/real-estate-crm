/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/admin/giveaways-create — create a new giveaway (session auth).

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const FC_ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

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
    const { title, prize_name, description, image_url, draw_date } = body;

    if (!title || !prize_name) {
      return NextResponse.json({ error: 'Title and prize required.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('giveaways')
      .insert({
        account_id: FC_ACCOUNT_ID,
        title,
        prize_name,
        description: description || null,
        image_url: image_url || null,
        draw_date: draw_date || null,
        is_active: false,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ giveaway: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

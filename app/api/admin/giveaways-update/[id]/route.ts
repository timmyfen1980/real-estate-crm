/* eslint-disable @typescript-eslint/no-explicit-any */
// PUT /api/admin/giveaways-update/[id] — update a giveaway (session auth).
// DELETE /api/admin/giveaways-update/[id] — delete a giveaway (session auth).

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const FC_ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

async function getAuthedClient() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getAuthedClient();
    if (!supabase) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    if (body.is_active === true) {
      await supabase
        .from('giveaways')
        .update({ is_active: false })
        .eq('account_id', FC_ACCOUNT_ID)
        .neq('id', id);
    }

    const updates: any = { updated_at: new Date().toISOString() };
    for (const k of ['title', 'prize_name', 'description', 'image_url', 'draw_date', 'is_active']) {
      if (body[k] !== undefined) updates[k] = body[k];
    }

    const { data, error } = await supabase
      .from('giveaways')
      .update(updates)
      .eq('id', id)
      .eq('account_id', FC_ACCOUNT_ID)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ giveaway: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getAuthedClient();
    if (!supabase) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const { id } = await params;
    const { error } = await supabase
      .from('giveaways')
      .delete()
      .eq('id', id)
      .eq('account_id', FC_ACCOUNT_ID);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

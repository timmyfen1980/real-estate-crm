/* eslint-disable @typescript-eslint/no-explicit-any */
// PUT /api/admin/giveaways/[id] — update a giveaway.
// DELETE /api/admin/giveaways/[id] — delete a giveaway.
// Auth: Bearer REA_AGENT_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const FC_ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token !== process.env.REA_AGENT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { title, prize_name, description, image_url, draw_date, is_active } = body;

    // If activating, deactivate others first
    if (is_active === true) {
      await supabase
        .from('giveaways')
        .update({ is_active: false })
        .eq('account_id', FC_ACCOUNT_ID)
        .neq('id', id);
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (prize_name !== undefined) updates.prize_name = prize_name;
    if (description !== undefined) updates.description = description;
    if (image_url !== undefined) updates.image_url = image_url;
    if (draw_date !== undefined) updates.draw_date = draw_date;
    if (is_active !== undefined) updates.is_active = is_active;

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
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token !== process.env.REA_AGENT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
      .from('giveaways')
      .delete()
      .eq('id', id)
      .eq('account_id', FC_ACCOUNT_ID);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

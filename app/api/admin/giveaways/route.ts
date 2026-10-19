/* eslint-disable @typescript-eslint/no-explicit-any */
// GET /api/admin/giveaways — list all giveaways for the account.
// POST /api/admin/giveaways — create a new giveaway.
// Auth: Bearer REA_AGENT_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const FC_ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

export async function GET(req: NextRequest) {
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

    const { data, error } = await supabase
      .from('giveaways')
      .select('*')
      .eq('account_id', FC_ACCOUNT_ID)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get entry counts
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
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

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
    const { title, prize_name, description, image_url, draw_date, is_active } = body;

    if (!title || !prize_name) {
      return NextResponse.json(
        { error: 'Title and prize name are required.' },
        { status: 400 }
      );
    }

    // If setting active, deactivate others first
    if (is_active) {
      await supabase
        .from('giveaways')
        .update({ is_active: false })
        .eq('account_id', FC_ACCOUNT_ID);
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
        is_active: is_active || false,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ giveaway: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/admin/merge-contacts — merge duplicate contacts.
// Body: { keep_id, merge_id, new_first_name?, new_last_name? }
// Auth: Bearer REA_AGENT_SECRET header.
// Moves all related records (contact_campaigns, email_logs, deals)
// from merge_id to keep_id, optionally updates keeper's name,
// then deletes merge_id.

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
    const keep_id = (body.keep_id || '').trim();
    const merge_id = (body.merge_id || '').trim();
    const new_first_name = (body.new_first_name || '').trim() || null;
    const new_last_name = (body.new_last_name || '').trim() || null;

    if (!keep_id || !merge_id || keep_id === merge_id) {
      return NextResponse.json({ error: 'Valid keep_id and merge_id required.' }, { status: 400 });
    }

    const { data: keepContact } = await supabase
      .from('contacts').select('id').eq('id', keep_id).single();
    const { data: mergeContact } = await supabase
      .from('contacts').select('id').eq('id', merge_id).single();

    if (!keepContact) {
      return NextResponse.json({ error: 'Keep contact not found.' }, { status: 404 });
    }
    if (!mergeContact) {
      return NextResponse.json({ error: 'Merge contact not found.' }, { status: 404 });
    }

    // Move all related records to the keeper
    const tables = ['contact_campaigns', 'email_logs', 'deals'];
    for (const table of tables) {
      try {
        const { error } = await supabase
          .from(table).update({ contact_id: keep_id }).eq('contact_id', merge_id);
        if (error && !error.message.includes('does not exist')) throw error;
      } catch (e: any) {
        if (!e.message?.includes('does not exist')) throw e;
      }
    }

    // Update keeper's name if provided
    if (new_first_name || new_last_name) {
      const updates: any = {};
      if (new_first_name) updates.first_name = new_first_name;
      if (new_last_name) updates.last_name = new_last_name;
      const { error: nameError } = await supabase
        .from('contacts').update(updates).eq('id', keep_id);
      if (nameError) throw nameError;
    }

    // Delete the duplicate
    const { error: delError } = await supabase
      .from('contacts').delete().eq('id', merge_id);
    if (delError) throw delError;

    return NextResponse.json({ ok: true, kept: keep_id, removed: merge_id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

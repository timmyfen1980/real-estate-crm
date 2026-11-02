/* eslint-disable @typescript-eslint/no-explicit-any */
// Beth's Hours — one entry (session auth; Beth only).
// PATCH  /api/hours/[id] — Beth edits an entry that is not on an invoice yet.
// DELETE /api/hours/[id] — Beth deletes an entry that is not on an invoice yet.
// Entries on an invoice are locked: they can never be changed or billed twice.

import { NextRequest, NextResponse } from 'next/server';
import {
  BETH_USER_ID,
  FC_ACCOUNT_ID,
  requireHoursAccess,
  toNum,
} from '@/lib/contractorHours';

async function loadEntry(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('contractor_time_entries')
    .select('id, work_date, hours, note, invoice_id, created_at')
    .eq('id', id)
    .eq('account_id', FC_ACCOUNT_ID)
    .eq('user_id', BETH_USER_ID)
    .single();
  if (error) return null;
  return data;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireHoursAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    if (!ctx.isBeth) {
      return NextResponse.json(
        { error: 'Only Beth can change her hours.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const entry = await loadEntry(ctx.supabase, id);
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }
    if (entry.invoice_id) {
      return NextResponse.json(
        {
          error:
            'This entry is already on an invoice, so it is locked and cannot be changed.',
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const updates: Record<string, any> = {};

    if (body.work_date !== undefined) {
      if (
        typeof body.work_date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(body.work_date)
      ) {
        return NextResponse.json(
          { error: 'Pick the day you worked.' },
          { status: 400 }
        );
      }
      updates.work_date = body.work_date;
    }
    if (body.hours !== undefined) {
      const hours = toNum(body.hours);
      if (!(hours > 0) || hours > 24) {
        return NextResponse.json(
          { error: 'Hours must be more than 0 and no more than 24.' },
          { status: 400 }
        );
      }
      updates.hours = hours;
    }
    if (body.note !== undefined) {
      updates.note =
        typeof body.note === 'string' && body.note.trim()
          ? body.note.trim()
          : null;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Nothing to update.' },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('contractor_time_entries')
      .update(updates)
      .eq('id', id)
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID)
      .is('invoice_id', null)
      .select('id, work_date, hours, note, invoice_id, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ entry: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireHoursAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    if (!ctx.isBeth) {
      return NextResponse.json(
        { error: 'Only Beth can delete her hours.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const entry = await loadEntry(ctx.supabase, id);
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }
    if (entry.invoice_id) {
      return NextResponse.json(
        {
          error:
            'This entry is already on an invoice, so it is locked and cannot be deleted.',
        },
        { status: 400 }
      );
    }

    const { error } = await ctx.supabase
      .from('contractor_time_entries')
      .delete()
      .eq('id', id)
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID)
      .is('invoice_id', null);

    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Beth's Hours — main route (session auth; Beth + account owner only).
// GET  /api/hours — Beth's entries, invoices, settings and owing totals.
// POST /api/hours — Beth adds an hours entry.

import { NextRequest, NextResponse } from 'next/server';
import {
  BETH_USER_ID,
  FC_ACCOUNT_ID,
  requireHoursAccess,
  round2,
  toNum,
} from '@/lib/contractorHours';

export async function GET() {
  try {
    const auth = await requireHoursAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    const supabase = ctx.supabase;

    const { data: settings, error: settingsError } = await supabase
      .from('contractor_settings')
      .select('rate, hst_number')
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID)
      .single();
    if (settingsError) throw settingsError;

    const { data: entries, error: entriesError } = await supabase
      .from('contractor_time_entries')
      .select('id, work_date, hours, note, invoice_id, created_at')
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID)
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (entriesError) throw entriesError;

    const { data: invoices, error: invoicesError } = await supabase
      .from('contractor_invoices')
      .select(
        'id, invoice_number, period_start, period_end, total_hours, rate, subtotal, hst_number, hst_amount, total, status, issued_at, paid_at'
      )
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID)
      .order('invoice_number', { ascending: false });
    if (invoicesError) throw invoicesError;

    const rate = toNum(settings.rate);
    const uninvoiced = (entries || []).filter((e: any) => !e.invoice_id);
    const uninvoicedHours = round2(
      uninvoiced.reduce((sum: number, e: any) => sum + toNum(e.hours), 0)
    );
    const uninvoicedAmount = round2(uninvoicedHours * rate);
    const unpaidInvoiceTotal = round2(
      (invoices || [])
        .filter((i: any) => i.status !== 'paid')
        .reduce((sum: number, i: any) => sum + toNum(i.total), 0)
    );

    return NextResponse.json({
      viewer: { isOwner: ctx.isOwner, isBeth: ctx.isBeth },
      settings: { rate, hst_number: settings.hst_number || null },
      entries: entries || [],
      invoices: invoices || [],
      totals: {
        uninvoiced_hours: uninvoicedHours,
        uninvoiced_amount: uninvoicedAmount,
        unpaid_invoice_total: unpaidInvoiceTotal,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireHoursAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    if (!ctx.isBeth) {
      return NextResponse.json(
        { error: 'Only Beth can add her hours.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const workDate = typeof body.work_date === 'string' ? body.work_date : '';
    const hours = toNum(body.hours);
    const note =
      typeof body.note === 'string' && body.note.trim()
        ? body.note.trim()
        : null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return NextResponse.json(
        { error: 'Pick the day you worked.' },
        { status: 400 }
      );
    }
    if (!(hours > 0) || hours > 24) {
      return NextResponse.json(
        { error: 'Hours must be more than 0 and no more than 24.' },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('contractor_time_entries')
      .insert({
        account_id: FC_ACCOUNT_ID,
        user_id: BETH_USER_ID,
        work_date: workDate,
        hours,
        note,
      })
      .select('id, work_date, hours, note, invoice_id, created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ entry: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

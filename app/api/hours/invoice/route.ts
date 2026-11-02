/* eslint-disable @typescript-eslint/no-explicit-any */
// Beth's Hours — make an invoice (session auth; Beth or the owner).
// POST /api/hours/invoice — bundles ALL of Beth's uninvoiced entries into
// one invoice, from Beth Nickle to Tim Fennessey Personal Real Estate
// Corporation. HST (13%) is charged only when Beth's HST number is on
// file in contractor_settings. Bundled entries get the invoice id and
// lock, so the same hours can never be billed twice.

import { NextResponse } from 'next/server';
import {
  BETH_USER_ID,
  FC_ACCOUNT_ID,
  HST_RATE,
  requireHoursAccess,
  round2,
  toNum,
} from '@/lib/contractorHours';

export async function POST() {
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
      .select('id, work_date, hours')
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID)
      .is('invoice_id', null)
      .order('work_date', { ascending: true });
    if (entriesError) throw entriesError;

    if (!entries || entries.length === 0) {
      return NextResponse.json(
        { error: 'There are no uninvoiced hours to put on an invoice yet.' },
        { status: 400 }
      );
    }

    const rate = toNum(settings.rate);
    const hstNumber = settings.hst_number || null;
    const totalHours = round2(
      entries.reduce((sum: number, e: any) => sum + toNum(e.hours), 0)
    );
    const subtotal = round2(totalHours * rate);
    const hstAmount = hstNumber ? round2(subtotal * HST_RATE) : 0;
    const total = round2(subtotal + hstAmount);
    const periodStart = entries[0].work_date;
    const periodEnd = entries[entries.length - 1].work_date;

    const { data: lastInvoice, error: lastError } = await supabase
      .from('contractor_invoices')
      .select('invoice_number')
      .eq('account_id', FC_ACCOUNT_ID)
      .order('invoice_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;
    const invoiceNumber = (lastInvoice?.invoice_number || 0) + 1;

    const { data: invoice, error: invoiceError } = await supabase
      .from('contractor_invoices')
      .insert({
        account_id: FC_ACCOUNT_ID,
        user_id: BETH_USER_ID,
        invoice_number: invoiceNumber,
        period_start: periodStart,
        period_end: periodEnd,
        total_hours: totalHours,
        rate,
        subtotal,
        hst_number: hstNumber,
        hst_amount: hstAmount,
        total,
        status: 'unpaid',
      })
      .select(
        'id, invoice_number, period_start, period_end, total_hours, rate, subtotal, hst_number, hst_amount, total, status, issued_at, paid_at'
      )
      .single();
    if (invoiceError) throw invoiceError;

    const entryIds = entries.map((e: any) => e.id);
    const { data: locked, error: lockError } = await supabase
      .from('contractor_time_entries')
      .update({ invoice_id: invoice.id })
      .in('id', entryIds)
      .is('invoice_id', null)
      .select('id');

    if (lockError || !locked || locked.length !== entryIds.length) {
      // Roll back the invoice so no hours sit in a half-billed state.
      await supabase.from('contractor_invoices').delete().eq('id', invoice.id);
      throw (
        lockError ||
        new Error('Could not lock all entries onto the invoice. Nothing was billed.')
      );
    }

    return NextResponse.json({ invoice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

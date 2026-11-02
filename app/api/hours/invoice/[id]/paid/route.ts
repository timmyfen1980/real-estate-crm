/* eslint-disable @typescript-eslint/no-explicit-any */
// Beth's Hours — mark an invoice paid (session auth; owner only).
// POST /api/hours/invoice/[id]/paid

import { NextRequest, NextResponse } from 'next/server';
import {
  BETH_USER_ID,
  FC_ACCOUNT_ID,
  requireHoursAccess,
} from '@/lib/contractorHours';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireHoursAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    if (!ctx.isOwner) {
      return NextResponse.json(
        { error: 'Only Tim can mark an invoice paid.' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const { data: invoice, error: loadError } = await ctx.supabase
      .from('contractor_invoices')
      .select('id, status')
      .eq('id', id)
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID)
      .single();
    if (loadError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }
    if (invoice.status === 'paid') {
      return NextResponse.json({ invoice, already_paid: true });
    }

    const { data, error } = await ctx.supabase
      .from('contractor_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID)
      .select(
        'id, invoice_number, period_start, period_end, total_hours, rate, subtotal, hst_number, hst_amount, total, status, issued_at, paid_at'
      )
      .single();

    if (error) throw error;
    return NextResponse.json({ invoice: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

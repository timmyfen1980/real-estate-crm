/* eslint-disable @typescript-eslint/no-explicit-any */
// Beth's Hours — settings (session auth; owner only).
// PATCH /api/hours/settings — Tim sets Beth's hourly rate and, once she
// registers, her HST number. While the HST number is blank her invoices
// carry no HST line at all.

import { NextRequest, NextResponse } from 'next/server';
import {
  BETH_USER_ID,
  FC_ACCOUNT_ID,
  requireHoursAccess,
  toNum,
} from '@/lib/contractorHours';

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireHoursAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    if (!ctx.isOwner) {
      return NextResponse.json(
        { error: 'Only Tim can change these settings.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const updates: Record<string, any> = {};

    if (body.rate !== undefined) {
      const rate = toNum(body.rate);
      if (!(rate > 0) || rate > 10000) {
        return NextResponse.json(
          { error: 'Rate must be more than 0.' },
          { status: 400 }
        );
      }
      updates.rate = rate;
    }
    if (body.hst_number !== undefined) {
      const raw = typeof body.hst_number === 'string' ? body.hst_number.trim() : '';
      updates.hst_number = raw ? raw : null;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Nothing to update.' },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('contractor_settings')
      .upsert(
        { account_id: FC_ACCOUNT_ID, user_id: BETH_USER_ID, ...updates },
        { onConflict: 'account_id,user_id' }
      )
      .select('rate, hst_number')
      .single();

    if (error) throw error;
    return NextResponse.json({
      settings: { rate: toNum(data.rate), hst_number: data.hst_number || null },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

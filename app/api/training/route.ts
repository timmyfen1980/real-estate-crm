/* eslint-disable @typescript-eslint/no-explicit-any */
// Beth's Training — progress route (session auth; Beth + account owner only).
// GET  /api/training — exercise list + Beth's progress rows.
// POST /api/training — Beth marks complete / uncomplete / saves a note;
//                      the owner (Tim) marks reviewed / unreviewed.
// Progress always belongs to Beth, whichever of the two is viewing.

import { NextRequest, NextResponse } from 'next/server';
import {
  BETH_USER_ID,
  FC_ACCOUNT_ID,
  TRAINING_EXERCISES,
  requireTrainingAccess,
} from '@/lib/training';

const EXERCISE_KEYS = new Set(TRAINING_EXERCISES.map((e) => e.key));

export async function GET() {
  try {
    const auth = await requireTrainingAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const { data: rows, error } = await ctx.supabase
      .from('training_progress')
      .select('exercise_key, note, completed_at, reviewed_at, updated_at')
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID);
    if (error) throw error;

    return NextResponse.json({
      viewer: { isOwner: ctx.isOwner, isBeth: ctx.isBeth },
      exercises: TRAINING_EXERCISES,
      progress: rows || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTrainingAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const body = await req.json();
    const exerciseKey = String(body.exercise_key || '');
    const action = String(body.action || '');
    if (!EXERCISE_KEYS.has(exerciseKey)) {
      return NextResponse.json({ error: 'Unknown exercise.' }, { status: 400 });
    }

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };

    if (action === 'complete' || action === 'uncomplete' || action === 'note') {
      if (!ctx.isBeth) {
        return NextResponse.json(
          { error: 'Only Beth can mark her own exercises.' },
          { status: 403 }
        );
      }
      if (action === 'complete') patch.completed_at = new Date().toISOString();
      if (action === 'uncomplete') patch.completed_at = null;
      if (action === 'note') patch.note = String(body.note || '').slice(0, 1000);
    } else if (action === 'review' || action === 'unreview') {
      if (!ctx.isOwner) {
        return NextResponse.json(
          { error: 'Only Tim can mark exercises reviewed.' },
          { status: 403 }
        );
      }
      patch.reviewed_at = action === 'review' ? new Date().toISOString() : null;
    } else {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from('training_progress')
      .upsert(
        {
          account_id: FC_ACCOUNT_ID,
          user_id: BETH_USER_ID,
          exercise_key: exerciseKey,
          ...patch,
        },
        { onConflict: 'account_id,user_id,exercise_key' }
      )
      .select('exercise_key, note, completed_at, reviewed_at, updated_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, progress: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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

// Keep Tim's task list in step with Beth's training. When Beth marks an
// exercise complete it is ready for review, so Tim (the account owner)
// gets a task for it; when he marks it reviewed the task completes.
// Uncomplete / unreview reverse the task the same way. Task sync is
// best-effort — the training progress row is the source of truth, so a
// task failure is logged, never thrown back at Beth or Tim.
async function syncTrainingReviewTask(
  supabase: any,
  exerciseKey: string,
  action: string,
  note?: string | null
) {
  try {
    const exercise = TRAINING_EXERCISES.find((e) => e.key === exerciseKey);
    if (!exercise) return;
    const title = `Review Beth's training: ${exercise.title}`;

    const { data: owner } = await supabase
      .from('account_users')
      .select('user_id')
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('role', 'owner')
      .single();
    if (!owner?.user_id) return;

    const { data: existing } = await supabase
      .from('tasks')
      .select('id, status')
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('source', 'training_review')
      .eq('title', title);
    const pending = (existing || []).filter((t: any) => t.status === 'pending');
    const pendingIds = pending.map((t: any) => t.id);

    if (action === 'complete' || action === 'unreview') {
      if (pendingIds.length === 0) {
        const dueDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Toronto',
        }).format(new Date());
        const { error } = await supabase.from('tasks').insert([
          {
            account_id: FC_ACCOUNT_ID,
            assigned_user_id: owner.user_id,
            created_by: BETH_USER_ID,
            title,
            description: note
              ? `Beth marked this training exercise complete — it's ready for your review. Her note: ${note} Review it here: https://crm.thefcgroup.ca/dashboard/beth-training`
              : `Beth marked this training exercise complete — it's ready for your review. Review it here: https://crm.thefcgroup.ca/dashboard/beth-training`,
            due_date: dueDate,
            priority: 'medium',
            status: 'pending',
            source: 'training_review',
            auto_generated: true,
          },
        ]);
        if (error)
          console.error('training review task insert failed:', error.message);
      }
    } else if (action === 'uncomplete') {
      if (pendingIds.length > 0) {
        const { error } = await supabase
          .from('tasks')
          .delete()
          .in('id', pendingIds);
        if (error)
          console.error('training review task delete failed:', error.message);
      }
    } else if (action === 'review') {
      if (pendingIds.length > 0) {
        const { error } = await supabase
          .from('tasks')
          .update({ status: 'completed' })
          .in('id', pendingIds);
        if (error)
          console.error('training review task complete failed:', error.message);
      }
    }
  } catch (e) {
    console.error('syncTrainingReviewTask failed:', e);
  }
}

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

    // For exercises built around a fake client, find the newest matching
    // practice file so the reviewer can jump straight to Beth's work
    // from the training page instead of hunting through Contacts.
    // Fail-quiet: any problem here just means no file links.
    const files: Record<string, { id: string }> = {};
    try {
      const { data: fileRows } = await ctx.supabase
        .from('client_files')
        .select('id, client_names, created_at')
        .ilike('client_names', '%training%')
        .order('created_at', { ascending: false })
        .limit(50);
      for (const ex of TRAINING_EXERCISES) {
        if (!ex.fakeClient) continue;
        const match = (fileRows || []).find((f: any) =>
          String(f.client_names || '')
            .toLowerCase()
            .includes(ex.fakeClient!.toLowerCase())
        );
        if (match) files[ex.key] = { id: match.id };
      }
    } catch {
      // No file links this load.
    }

    return NextResponse.json({
      viewer: { isOwner: ctx.isOwner, isBeth: ctx.isBeth },
      exercises: TRAINING_EXERCISES,
      progress: rows || [],
      files,
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

    if (
      action === 'complete' ||
      action === 'uncomplete' ||
      action === 'review' ||
      action === 'unreview'
    ) {
      await syncTrainingReviewTask(ctx.supabase, exerciseKey, action, data?.note);
    }

    return NextResponse.json({ ok: true, progress: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

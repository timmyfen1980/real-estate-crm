/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';

interface TrainingExercise {
  key: string;
  title: string;
  minutes: string;
  intro: string;
  steps: string[];
  doneWhen: string;
}

interface ProgressRow {
  exercise_key: string;
  note: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

interface TrainingData {
  viewer: { isOwner: boolean; isBeth: boolean };
  exercises: TrainingExercise[];
  progress: ProgressRow[];
}

const NAVY = '#0f2a44';
const RED = '#d22630';
const GREEN = '#1e7d32';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BethTrainingPage() {
  const [data, setData] = useState<TrainingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/training');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load training.');
      setData(json);
      const n: Record<string, string> = {};
      for (const row of json.progress || []) n[row.exercise_key] = row.note || '';
      setNotes(n);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (exerciseKey: string, action: string, note?: string) => {
    setBusyKey(`${action}:${exerciseKey}`);
    try {
      const res = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise_key: exerciseKey, action, note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'That did not save.');
      await load();
    } catch (e: any) {
      alert(e.message);
    }
    setBusyKey(null);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Beth&apos;s Training</h1>
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Beth&apos;s Training</h1>
        <p className="mt-4 text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const progressByKey = new Map(data.progress.map((r) => [r.exercise_key, r]));
  const completedCount = data.exercises.filter((e) => progressByKey.get(e.key)?.completed_at).length;
  const reviewedCount = data.exercises.filter((e) => progressByKey.get(e.key)?.reviewed_at).length;
  const pct = data.exercises.length ? Math.round((completedCount / data.exercises.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Beth&apos;s Training</h1>

      {data.viewer.isBeth && (
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Hands-on practice in the real system, using fake clients only. Work through each
          exercise, tick it complete when you finish, and leave a note saying what you created.
          Tim reviews your work from this page. Every fake name starts with{' '}
          <strong>TRAINING</strong> so nothing ever gets mixed up with a real client — Tim
          deletes the practice files once he has reviewed them.
        </p>
      )}
      {data.viewer.isOwner && (
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Beth&apos;s practice exercises. She ticks each one complete and notes what she
          created; open the TRAINING files she made, check them, then tick{' '}
          <strong>Reviewed</strong>. The practice contacts can be deleted once you have
          reviewed them.
        </p>
      )}

      <div className="mt-5 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold" style={{ color: NAVY }}>
            {completedCount} of {data.exercises.length} exercises complete
          </span>
          <span className="text-gray-500">{reviewedCount} reviewed</span>
        </div>
        <div className="mt-2 h-2.5 w-full rounded-full bg-gray-100">
          <div
            className="h-2.5 rounded-full transition-all"
            style={{ width: `${pct}%`, background: completedCount === data.exercises.length ? GREEN : RED }}
          />
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {data.exercises.map((ex, i) => {
          const row = progressByKey.get(ex.key);
          const done = !!row?.completed_at;
          const reviewed = !!row?.reviewed_at;
          return (
            <div key={ex.key} className="rounded-xl border bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-bold" style={{ color: NAVY }}>
                  {i + 1}. {ex.title}
                </h2>
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {ex.minutes}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-600">{ex.intro}</p>

              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-gray-700">
                {ex.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>

              <p className="mt-3 text-sm text-gray-600">
                <strong style={{ color: NAVY }}>Done when:</strong> {ex.doneWhen}
              </p>

              {data.viewer.isBeth ? (
                <div className="mt-4">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Your note (what you created, or anything that looked off)
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={notes[ex.key] ?? ''}
                      onChange={(e) => setNotes({ ...notes, [ex.key]: e.target.value })}
                      placeholder="e.g. Created TRAINING Tina Buyer — buyer file"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => act(ex.key, 'note', notes[ex.key] ?? '')}
                      disabled={busyKey === `note:${ex.key}`}
                      className="shrink-0 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Save note
                    </button>
                  </div>
                </div>
              ) : (
                row?.note && (
                  <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    <strong>Beth&apos;s note:</strong> {row.note}
                  </p>
                )
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                {done ? (
                  <span className="rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ background: GREEN }}>
                    ✓ Completed {fmtDate(row!.completed_at)}
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">
                    Not completed yet
                  </span>
                )}
                {reviewed && (
                  <span className="rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ background: NAVY }}>
                    ✓ Reviewed by Tim {fmtDate(row!.reviewed_at)}
                  </span>
                )}

                <span className="ml-auto flex gap-2">
                  {data.viewer.isBeth &&
                    (done ? (
                      <button
                        onClick={() => act(ex.key, 'uncomplete')}
                        disabled={busyKey === `uncomplete:${ex.key}`}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Undo complete
                      </button>
                    ) : (
                      <button
                        onClick={() => act(ex.key, 'complete')}
                        disabled={busyKey === `complete:${ex.key}`}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: RED }}
                      >
                        Mark complete
                      </button>
                    ))}
                  {data.viewer.isOwner &&
                    done &&
                    (reviewed ? (
                      <button
                        onClick={() => act(ex.key, 'unreview')}
                        disabled={busyKey === `unreview:${ex.key}`}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Undo review
                      </button>
                    ) : (
                      <button
                        onClick={() => act(ex.key, 'review')}
                        disabled={busyKey === `review:${ex.key}`}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: NAVY }}
                      >
                        Mark reviewed
                      </button>
                    ))}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs leading-5 text-gray-400">
        Golden rule: practice files always use fake clients whose names start with TRAINING.
        Never practise on a real client&apos;s file. If you get stuck, ask Tim — or open Help
        &amp; Training in the sidebar.
      </p>
    </div>
  );
}

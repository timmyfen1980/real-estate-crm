'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Past Client Review — walk the past-client archive one item at a time
// against the live contacts and record a decision per item:
//   merge = update the matched contact (fills blanks only, + history note)
//   add   = create a new contact
//   skip  = don't import this one
// Decisions are recorded via /api/past-clients-review; nothing is
// applied to contacts from this page.

import { useEffect, useMemo, useState } from 'react';

const NAVY = '#0f2a44';
const RED = '#d22630';

type Candidate = {
  contact_id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  lifecycle_stage: string;
  client_category: string;
  matched_on: string[];
  strong_signal: boolean;
  diff_adds: string[];
};

type Payload = {
  address: string;
  city: string;
  date: string;
  price: string;
  type_label: string;
  sellers: string;
  buyers: string;
  tim_represented: string;
  client_names: string;
  client_email: string;
  client_phone: string;
  moved_to: string;
  flag: string;
  evidence_short: string;
  has_unverified: boolean;
};

type Item = {
  item_key: string;
  sort_order: number;
  payload: Payload;
  match_status: 'strong' | 'possible' | 'none' | 'na';
  match_candidates: Candidate[];
  decision: 'add' | 'merge' | 'skip' | null;
  chosen_contact_id: string | null;
  decided_at: string | null;
  applied_at: string | null;
  apply_result: string | null;
};

type Progress = { total: number; decided: number; add: number; merge: number; skip: number };

type Filter = 'all' | 'undecided' | 'strong' | 'possible' | 'none' | 'decided';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'undecided', label: 'Undecided' },
  { key: 'strong', label: 'Already in database' },
  { key: 'possible', label: 'Possible match' },
  { key: 'none', label: 'Not in database' },
  { key: 'decided', label: 'Decided' },
];

const STATUS_BADGE: Record<Item['match_status'], { label: string; cls: string }> = {
  strong: { label: 'In your database', cls: 'bg-green-100 text-green-800 border-green-200' },
  possible: { label: 'Possible match', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  none: { label: 'Not in database', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  na: { label: 'Not your client', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

function decisionLabel(it: Item): string {
  if (it.decision === 'add') return 'Add as new contact';
  if (it.decision === 'skip') return 'Skipped';
  if (it.decision === 'merge') {
    const c = (it.match_candidates || []).find(
      (x) => x.contact_id === it.chosen_contact_id
    );
    return c ? `Update ${c.name}` : 'Update contact';
  }
  return '';
}

export default function PastClientsPage() {
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [progress, setProgress] = useState<Progress>({
    total: 0,
    decided: 0,
    add: 0,
    merge: 0,
    skip: 0,
  });
  const [filter, setFilter] = useState<Filter>('undecided');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedDecided, setExpandedDecided] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/past-clients-review');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load the review list.');
      if (data.needsSetup) {
        setNeedsSetup(true);
        setItems([]);
        return;
      }
      const list: Item[] = data.items || [];
      setItems(list);
      setProgress(data.progress);
      const sel: Record<string, string> = {};
      for (const it of list) {
        if (it.match_candidates?.length) {
          sel[it.item_key] =
            it.chosen_contact_id || it.match_candidates[0].contact_id;
        }
      }
      setSelected(sel);
    } catch (e: any) {
      setError(e.message || 'Could not load the review list.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(
    it: Item,
    decision: 'add' | 'merge' | 'skip' | null,
    chosenContactId?: string | null
  ) {
    setSavingKey(it.item_key);
    try {
      const res = await fetch('/api/past-clients-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_key: it.item_key,
          decision,
          chosen_contact_id:
            decision === 'merge'
              ? chosenContactId ?? selected[it.item_key] ?? null
              : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save that decision.');
      if (data.needsSetup) {
        setNeedsSetup(true);
        return;
      }
      setItems((prev) =>
        prev.map((x) => (x.item_key === it.item_key ? (data.item as Item) : x))
      );
      if (data.progress) setProgress(data.progress);
      setExpandedDecided(null);
    } catch (e: any) {
      setError(e.message || 'Could not save that decision.');
    } finally {
      setSavingKey(null);
    }
  }

  const visible = useMemo(() => {
    return items.filter((it) => {
      switch (filter) {
        case 'undecided':
          return !it.decision;
        case 'decided':
          return !!it.decision;
        case 'strong':
          return it.match_status === 'strong';
        case 'possible':
          return it.match_status === 'possible';
        case 'none':
          return it.match_status === 'none';
        default:
          return true;
      }
    });
  }, [items, filter]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>
          Past Client Review
        </h1>
        <p className="text-sm text-gray-500">Loading your past-client list…</p>
      </div>
    );
  }

  if (needsSetup || items.length === 0) {
    return (
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>
          Past Client Review
        </h1>
        <div className="bg-white border rounded-xl shadow-sm p-6">
          <p className="font-semibold mb-1" style={{ color: NAVY }}>
            Setup pending
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            The review list isn&apos;t in the database yet. Once the one-time
            setup is finished, this page fills with your past clients one by
            one — each with its match in your contacts and a choice: update
            that contact, add as new, or skip. Tell Rea if this panel is
            still here and she&apos;ll finish the setup.
          </p>
        </div>
      </div>
    );
  }

  const pct = progress.total
    ? Math.round((progress.decided / progress.total) * 100)
    : 0;

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-1" style={{ color: NAVY }}>
        Past Client Review
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        Your past clients from the old files, checked against your contacts
        one by one. For each: update the contact you already have, add them
        as new, or skip. Nothing changes in your contacts until you say go —
        this page just records your choices.
      </p>

      {/* Progress */}
      <div className="bg-white border rounded-xl shadow-sm p-5 mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <p className="font-semibold" style={{ color: NAVY }}>
            {progress.decided} of {progress.total} decided
          </p>
          <p className="text-sm text-gray-500">
            {progress.merge} to update · {progress.add} to add ·{' '}
            {progress.skip} skipped
          </p>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: RED }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 mb-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`text-sm rounded-full px-4 py-2 border transition ${
              filter === f.key
                ? 'text-white border-transparent'
                : 'bg-white text-gray-600 hover:border-[#0f2a44]'
            }`}
            style={filter === f.key ? { background: NAVY } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <div className="bg-white border rounded-xl shadow-sm p-6 text-sm text-gray-500">
          Nothing in this view.
        </div>
      )}

      <div className="space-y-4">
        {visible.map((it) =>
          it.decision && expandedDecided !== it.item_key ? (
            <DecidedRow
              key={it.item_key}
              it={it}
              saving={savingKey === it.item_key}
              onUndo={() => decide(it, null)}
              onReview={() => setExpandedDecided(it.item_key)}
            />
          ) : (
            <ItemCard
              key={it.item_key}
              it={it}
              saving={savingKey === it.item_key}
              selectedContact={selected[it.item_key] || ''}
              onSelect={(cid) =>
                setSelected((s) => ({ ...s, [it.item_key]: cid }))
              }
              onDecide={(d, cid) => decide(it, d, cid)}
              decidedOpen={!!it.decision}
              onCollapse={() => setExpandedDecided(null)}
            />
          )
        )}
      </div>
    </div>
  );
}

function DecidedRow({
  it,
  saving,
  onUndo,
  onReview,
}: {
  it: Item;
  saving: boolean;
  onUndo: () => void;
  onReview: () => void;
}) {
  const p = it.payload;
  return (
    <div className="bg-white border rounded-xl shadow-sm px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-semibold" style={{ color: NAVY }}>
        {p.address}
        {p.city ? `, ${p.city}` : ''}
      </span>
      <span className="text-sm text-gray-500">
        {p.client_names || p.type_label}
      </span>
      <span
        className={`text-xs font-semibold rounded-full px-2.5 py-1 border ${
          it.decision === 'skip'
            ? 'bg-gray-100 text-gray-600 border-gray-200'
            : 'bg-green-50 text-green-800 border-green-200'
        }`}
      >
        {decisionLabel(it)}
      </span>
      {it.applied_at && (
        <span className="text-xs text-gray-400">
          Applied{it.apply_result ? ` — ${it.apply_result}` : ''}
        </span>
      )}
      <span className="ml-auto flex gap-2">
        <button
          type="button"
          onClick={onReview}
          className="text-sm border rounded-full px-3 py-1.5 text-gray-600 transition hover:bg-gray-50"
        >
          Review
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onUndo}
          className="text-sm border rounded-full px-3 py-1.5 transition hover:bg-red-50 disabled:opacity-50"
          style={{ color: RED }}
        >
          {saving ? 'Saving…' : 'Undo'}
        </button>
      </span>
    </div>
  );
}

function ItemCard({
  it,
  saving,
  selectedContact,
  onSelect,
  onDecide,
  decidedOpen,
  onCollapse,
}: {
  it: Item;
  saving: boolean;
  selectedContact: string;
  onSelect: (cid: string) => void;
  onDecide: (d: 'add' | 'merge' | 'skip', cid?: string | null) => void;
  decidedOpen: boolean;
  onCollapse: () => void;
}) {
  const p = it.payload;
  const badge = STATUS_BADGE[it.match_status];
  const greyed = it.match_status === 'na';

  const btnBase =
    'text-sm rounded-full px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed';
  const btnPrimary = `${btnBase} text-white hover:opacity-90`;
  const btnGhost = `${btnBase} border bg-white text-gray-600 hover:bg-gray-50`;

  return (
    <div
      className={`bg-white border rounded-xl shadow-sm overflow-hidden ${
        greyed ? 'opacity-75' : ''
      }`}
    >
      <div className="grid md:grid-cols-2">
        {/* LEFT — the archive record */}
        <div className="p-5 border-b md:border-b-0 md:border-r">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
            <h2 className="font-bold text-lg leading-snug" style={{ color: NAVY }}>
              {p.address}
              {p.city ? `, ${p.city}` : ''}
            </h2>
            <span
              className={`text-[11px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-800 mb-3">
            {p.type_label}
            {p.price ? ` · ${p.price}` : ''}
            {p.date ? ` · ${p.date}` : ''}
          </p>
          <dl className="space-y-1.5 text-sm">
            {p.client_names && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-gray-400">Your client</dt>
                <dd className="font-medium text-gray-800">{p.client_names}</dd>
              </div>
            )}
            {p.sellers && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-gray-400">Seller</dt>
                <dd className="text-gray-700">{p.sellers}</dd>
              </div>
            )}
            {p.buyers && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-gray-400">Buyer</dt>
                <dd className="text-gray-700">{p.buyers}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-400">You acted for</dt>
              <dd className="text-gray-700">{p.tim_represented}</dd>
            </div>
            {p.client_email && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-gray-400">Email (file)</dt>
                <dd className="text-gray-700 break-all">{p.client_email}</dd>
              </div>
            )}
            {p.client_phone && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-gray-400">Phone (file)</dt>
                <dd className="text-gray-700">{p.client_phone}</dd>
              </div>
            )}
            {p.moved_to && (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-gray-400">Moved to</dt>
                <dd className="text-gray-700">{p.moved_to}</dd>
              </div>
            )}
          </dl>
          {p.flag &&
            (p.has_unverified ? (
              <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 px-3.5 py-2.5 text-[13px] text-yellow-900 leading-relaxed">
                {p.flag}
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-gray-500 leading-relaxed">
                {p.flag}
              </p>
            ))}
          {p.evidence_short && (
            <p className="mt-2 text-xs text-gray-400">
              Source: {p.evidence_short}
            </p>
          )}
        </div>

        {/* RIGHT — the database side + the decision */}
        <div className="p-5 bg-gray-50/60 flex flex-col">
          {it.match_status === 'na' && (
            <>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                You weren&apos;t their agent on this one — nothing to import.
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onDecide('skip')}
                  className={btnPrimary}
                  style={{ background: NAVY }}
                >
                  {saving ? 'Saving…' : 'Confirm skip'}
                </button>
                {decidedOpen && (
                  <button type="button" onClick={onCollapse} className={btnGhost}>
                    Close
                  </button>
                )}
              </div>
            </>
          )}

          {it.match_status === 'none' && (
            <>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                Not in your database. Add them as a new contact — with the
                details from the file and a note on this deal — or skip.
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onDecide('add')}
                  className={btnPrimary}
                  style={{ background: RED }}
                >
                  {saving ? 'Saving…' : 'Add as new contact'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onDecide('skip')}
                  className={btnGhost}
                >
                  Skip
                </button>
                {decidedOpen && (
                  <button type="button" onClick={onCollapse} className={btnGhost}>
                    Close
                  </button>
                )}
              </div>
            </>
          )}

          {it.match_status === 'strong' && it.match_candidates[0] && (
            <>
              <ContactCard c={it.match_candidates[0]} heading="Already in your database" />
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    onDecide('merge', it.match_candidates[0].contact_id)
                  }
                  className={btnPrimary}
                  style={{ background: RED }}
                >
                  {saving ? 'Saving…' : 'Update this contact'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onDecide('skip')}
                  className={btnGhost}
                >
                  Skip
                </button>
                {decidedOpen && (
                  <button type="button" onClick={onCollapse} className={btnGhost}>
                    Close
                  </button>
                )}
              </div>
            </>
          )}

          {it.match_status === 'possible' && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Could be one of these — pick the right one
              </p>
              <div className="space-y-2.5 mb-4">
                {it.match_candidates.map((c) => (
                  <label
                    key={c.contact_id}
                    className={`block bg-white border rounded-lg px-3.5 py-3 cursor-pointer transition ${
                      selectedContact === c.contact_id
                        ? 'border-[#0f2a44] ring-1 ring-[#0f2a44]'
                        : 'hover:border-gray-300'
                    }`}
                  >
                    <span className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name={`cand-${it.item_key}`}
                        className="mt-1"
                        checked={selectedContact === c.contact_id}
                        onChange={() => onSelect(c.contact_id)}
                      />
                      <span className="flex-1">
                        <span className="block font-semibold text-sm" style={{ color: NAVY }}>
                          {c.name}
                        </span>
                        <span className="block text-xs text-gray-500">
                          Matched on: {c.matched_on.join(' · ')}
                        </span>
                        <DiffList c={c} />
                      </span>
                    </span>
                  </label>
                ))}
                <label
                  className={`block bg-white border rounded-lg px-3.5 py-3 cursor-pointer transition ${
                    selectedContact === 'none'
                      ? 'border-[#0f2a44] ring-1 ring-[#0f2a44]'
                      : 'hover:border-gray-300'
                  }`}
                >
                  <span className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name={`cand-${it.item_key}`}
                      className="mt-1"
                      checked={selectedContact === 'none'}
                      onChange={() => onSelect('none')}
                    />
                    <span className="text-sm text-gray-600">
                      None of these is the right person
                    </span>
                  </span>
                </label>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || !selectedContact || selectedContact === 'none'}
                  onClick={() => onDecide('merge', selectedContact)}
                  className={btnPrimary}
                  style={{ background: RED }}
                >
                  {saving ? 'Saving…' : 'Update selected contact'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onDecide('add')}
                  className={btnGhost}
                >
                  Add as new instead
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onDecide('skip')}
                  className={btnGhost}
                >
                  Skip
                </button>
                {decidedOpen && (
                  <button type="button" onClick={onCollapse} className={btnGhost}>
                    Close
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactCard({ c, heading }: { c: Candidate; heading: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
        {heading}
      </p>
      <div className="bg-white border rounded-lg px-3.5 py-3 mb-3">
        <p className="font-semibold text-sm" style={{ color: NAVY }}>
          {c.name}
        </p>
        <p className="text-xs text-gray-500 mb-1">
          Matched on: {c.matched_on.join(' · ')}
        </p>
        <p className="text-sm text-gray-600">
          {c.email || 'No email on file'}
          {c.phone ? ` · ${c.phone}` : ''}
          {c.address ? ` · ${c.address}` : ''}
        </p>
        <DiffList c={c} />
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">
        Updating fills in blanks only — anything already on the contact stays
        exactly as it is.
      </p>
    </div>
  );
}

function DiffList({ c }: { c: Candidate }) {
  if (!c.diff_adds?.length) return null;
  return (
    <span className="block mt-2">
      <span className="block text-xs font-semibold text-gray-500 mb-1">
        An update would add:
      </span>
      <ul className="list-disc pl-4 space-y-0.5">
        {c.diff_adds.map((d, i) => (
          <li key={i} className="text-[13px] text-gray-600">
            {d}
          </li>
        ))}
      </ul>
    </span>
  );
}

'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Past Client Review — walk the past-client archive one item at a time
// against the live contacts. Decisions are PER PERSON: each named client
// on an item gets their own match, their own choice (update that contact
// / add as new / skip this person), their own file-detail assignments
// (which email belongs to whom) and their own address choice.
// Phone numbers are OUT of scope for this cleanup (Tim, Nov 12, 2026):
// Google Contacts wins — a number already on a contact is never changed
// here. Emails, addresses, birthdays and home-purchase anniversaries
// (newest purchase only) are what get added.
// Decisions are recorded via /api/past-clients-review; nothing is
// applied to contacts from this page.

import { useEffect, useMemo, useState } from 'react';

const NAVY = '#0f2a44';
const RED = '#d22630';

type Candidate = {
  contact_id: string;
  name: string;
  email: string;
  secondary_email: string;
  phone: string;
  secondary_phone: string;
  address: string;
  lifecycle_stage: string;
  client_category: string;
  matched_on: string[];
  strong_signal: boolean;
  diff_adds: string[];
};

type TimelineEvent = {
  item_key: string;
  address: string;
  city: string;
  role: string;
  price: string;
  date_label: string;
  date_iso: string | null;
  source?: string;
};

type AddressCandidate = {
  value: string;
  kind: 'purchase' | 'mail' | 'moved-to' | 'database-current';
  date_label: string;
  date_iso: string | null;
  source: string;
  sold_later?: boolean;
};

type Person = {
  person_key: string;
  name: string;
  first_name: string;
  status: 'strong' | 'possible' | 'none';
  candidates: Candidate[];
  timeline: TimelineEvent[];
  address_candidates: AddressCandidate[];
  newest_address: {
    address: string;
    kind: string;
    date_label: string;
    source: string;
  } | null;
  mail_address: { address: string; date_label: string } | null;
  repeats: string[];
  // v3 enrichment (Nov 12, 2026) — birthdays, purchase anniversaries,
  // Google Contacts facts. All optional; absent on older payloads.
  birthday_status?: 'already_on_contact' | 'candidate' | 'none';
  birthday_existing?: string | null;
  birthday_candidate?: {
    date: string | null;
    month_day: string;
    source: string;
  } | null;
  anniversary_status?: 'already_on_contact' | 'candidate' | 'none';
  anniversary_existing?: string | null;
  anniversary_candidate?: {
    date: string;
    address: string;
    source?: string;
  } | null;
  anniversary_note?: string;
  google_phone?: string | null;
  google_email?: string | null;
};

type FileDetailEmail = {
  value: string;
  default_person: string | null;
  source?: string;
};
type FileDetailPhone = { value: string; digits: string; default_person: string | null };

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
  file_details?: { emails: FileDetailEmail[]; phones: FileDetailPhone[] };
  persons?: Person[];
};

type AddressChoice = { choice: 'candidate' | 'blank' | 'keep'; value: string };

type PersonDecision = {
  decision?: 'merge' | 'add' | 'skip';
  contact_id?: string | null;
  assign?: { emails: string[]; phones: string[] };
  address?: AddressChoice;
};

type Item = {
  item_key: string;
  sort_order: number;
  payload: Payload;
  match_status: 'strong' | 'possible' | 'none' | 'na';
  match_candidates: Candidate[];
  decision: 'add' | 'merge' | 'skip' | 'persons' | null;
  chosen_contact_id: string | null;
  person_decisions: Record<string, PersonDecision>;
  decided_at: string | null;
  applied_at: string | null;
  apply_result: string | null;
};

type Progress = {
  total: number;
  decided: number;
  add: number;
  merge: number;
  skip: number;
  persons_total: number;
  persons_decided: number;
};

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

const ITEM_DECISIONS = ['add', 'merge', 'skip'];

function personsOf(it: Item): Person[] {
  return Array.isArray(it.payload?.persons) ? it.payload.persons : [];
}

function isFullyDecided(it: Item): boolean {
  if (it.decision && ITEM_DECISIONS.includes(it.decision)) return true;
  const persons = personsOf(it);
  if (!persons.length) return false;
  const pd = it.person_decisions || {};
  return persons.every((p) => pd[p.person_key]?.decision);
}

function decisionLabel(it: Item): string {
  if (it.decision === 'add') return 'Add as new contact';
  if (it.decision === 'skip') return 'Skipped';
  if (it.decision === 'merge') {
    const c = (it.match_candidates || []).find(
      (x) => x.contact_id === it.chosen_contact_id
    );
    return c ? `Update ${c.name}` : 'Update contact';
  }
  if (it.decision === 'persons' || personsOf(it).length) {
    const pd = it.person_decisions || {};
    let u = 0,
      a = 0,
      s = 0;
    for (const p of personsOf(it)) {
      const d = pd[p.person_key]?.decision;
      if (d === 'merge') u++;
      else if (d === 'add') a++;
      else if (d === 'skip') s++;
    }
    const bits: string[] = [];
    if (u) bits.push(`${u} to update`);
    if (a) bits.push(`${a} to add`);
    if (s) bits.push(`${s} skipped`);
    return bits.length ? bits.join(' · ') : 'Decided';
  }
  return '';
}

function prettyPhone(raw: string): string {
  const d = (raw || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw || '';
}

function digitsOf(raw: string): string {
  const d = (raw || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? d : '';
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
    persons_total: 0,
    persons_decided: 0,
  });
  const [filter, setFilter] = useState<Filter>('undecided');
  const [legacySelected, setLegacySelected] = useState<Record<string, string>>({});
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
      const list: Item[] = (data.items || []).map((it: Item) => ({
        ...it,
        person_decisions: it.person_decisions || {},
      }));
      setItems(list);
      setProgress(data.progress);
      const sel: Record<string, string> = {};
      for (const it of list) {
        if (!personsOf(it).length && it.match_candidates?.length) {
          sel[it.item_key] =
            it.chosen_contact_id || it.match_candidates[0].contact_id;
        }
      }
      setLegacySelected(sel);
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

  function applySaved(data: any, fallbackKey: string) {
    if (data.needsSetup) {
      setNeedsSetup(true);
      return;
    }
    if (data.item) {
      setItems((prev) =>
        prev.map((x) =>
          x.item_key === (data.item.item_key || fallbackKey)
            ? { ...data.item, person_decisions: data.item.person_decisions || {} }
            : x
        )
      );
    }
    if (data.progress) setProgress(data.progress);
  }

  async function decideItem(
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
              ? chosenContactId ?? legacySelected[it.item_key] ?? null
              : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save that decision.');
      applySaved(data, it.item_key);
      setExpandedDecided(null);
    } catch (e: any) {
      setError(e.message || 'Could not save that decision.');
    } finally {
      setSavingKey(null);
    }
  }

  async function savePersons(it: Item, pd: Record<string, PersonDecision>) {
    setSavingKey(it.item_key);
    try {
      const res = await fetch('/api/past-clients-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_key: it.item_key, person_decisions: pd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save those choices.');
      applySaved(data, it.item_key);
    } catch (e: any) {
      setError(e.message || 'Could not save those choices.');
    } finally {
      setSavingKey(null);
    }
  }

  const visible = useMemo(() => {
    return items.filter((it) => {
      switch (filter) {
        case 'undecided':
          return !isFullyDecided(it);
        case 'decided':
          return isFullyDecided(it);
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
            one — each person with their match in your contacts and their own
            choice: update that contact, add as new, or skip. Tell Rea if
            this panel is still here and she&apos;ll finish the setup.
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
        Your past clients from the old files, checked against your contacts.
        Every person gets their own decision — update their contact, add
        them as new, or skip them — and you choose which of the file&apos;s
        emails belong to whom, and what happens with their address.
        Phone numbers are never changed in this cleanup: if Google
        Contacts has their cell, it stays exactly as it is. Birthdays and
        home purchase anniversaries (from their newest purchase) get
        added where we found them. Nothing changes in your contacts
        until you say go — this page just records your choices.
      </p>

      {/* Progress */}
      <div className="bg-white border rounded-xl shadow-sm p-5 mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <p className="font-semibold" style={{ color: NAVY }}>
            {progress.decided} of {progress.total} decided
          </p>
          <p className="text-sm text-gray-500">
            {progress.persons_decided} of {progress.persons_total} people
            decided · {progress.merge} to update · {progress.add} to add ·{' '}
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
          isFullyDecided(it) && expandedDecided !== it.item_key ? (
            <DecidedRow
              key={it.item_key}
              it={it}
              saving={savingKey === it.item_key}
              onUndo={() => decideItem(it, null)}
              onReview={() => setExpandedDecided(it.item_key)}
            />
          ) : (
            <ItemCard
              key={it.item_key}
              it={it}
              saving={savingKey === it.item_key}
              legacySelected={legacySelected[it.item_key] || ''}
              onLegacySelect={(cid) =>
                setLegacySelected((s) => ({ ...s, [it.item_key]: cid }))
              }
              onItemDecide={(d, cid) => decideItem(it, d, cid)}
              onSavePersons={(pd) => savePersons(it, pd)}
              decidedOpen={isFullyDecided(it)}
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


const btnBase =
  'text-sm rounded-full px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = `${btnBase} text-white hover:opacity-90`;
const btnGhost = `${btnBase} border bg-white text-gray-600 hover:bg-gray-50`;

function DiffList({ c }: { c: Candidate }) {
  // Phone changes are out of scope for this cleanup — never list them.
  const adds = (c.diff_adds || []).filter((d) => !/phone/i.test(d));
  if (!adds.length) return null;
  return (
    <span className="block mt-2">
      <span className="block text-xs font-semibold text-gray-500 mb-1">
        An update would add:
      </span>
      <ul className="list-disc pl-4 space-y-0.5">
        {adds.map((d, i) => (
          <li key={i} className="text-[13px] text-gray-600">
            {d}
          </li>
        ))}
      </ul>
    </span>
  );
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
];

// '2016-06-10' -> 'Jun 10, 2016' (string-split only, no timezone drift)
function fmtISO(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// '04-24' -> 'April 24' (birthday whose birth year is unknown)
function fmtMonthDay(md: string | null | undefined): string {
  if (!md) return '';
  const m = /^(\d{2})-(\d{2})$/.exec(md);
  if (!m) return md;
  return `${MONTHS_LONG[Number(m[1]) - 1]} ${Number(m[2])}`;
}

function birthdayLabel(person: Person): string {
  const c = person.birthday_candidate;
  if (!c) return '';
  return c.date ? fmtISO(c.date) : fmtMonthDay(c.month_day);
}

function ContactBox({ c }: { c: Candidate }) {
  return (
    <div className="bg-white border rounded-lg px-3.5 py-3">
      <p className="font-semibold text-sm" style={{ color: NAVY }}>
        {c.name}
      </p>
      <p className="text-xs text-gray-500 mb-1">
        Matched on: {c.matched_on.join(' · ')}
      </p>
      <p className="text-sm text-gray-600">
        {c.email || 'No email on file'}
        {c.phone ? ` · ${prettyPhone(c.phone)}` : ''}
        {c.address ? ` · ${c.address}` : ''}
      </p>
      <DiffList c={c} />
    </div>
  );
}

function timelineText(person: Person): { text: string; tail: string } {
  const evs = [
    ...person.timeline.map((e) => ({
      label: `${e.role} ${e.address}${e.source ? ' (sales database)' : ''}`,
      date: e.date_label,
      iso: e.date_iso || '',
      sold: e.role === 'Sold',
    })),
    ...person.address_candidates
      .filter((c) => c.kind === 'mail')
      .map((c) => ({
        label: `Mail address ${c.value}`,
        date: c.date_label,
        iso: c.date_iso || '',
        sold: false,
      })),
  ].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  const text = evs
    .map((e) => `${e.label} — ${e.date || 'date unknown'}`)
    .join(' · ');
  const lastDated = [...evs].reverse().find((e) => e.iso);
  const tail =
    lastDated?.sold
      ? `Nothing after ${lastDated.date} — may have moved again.`
      : '';
  return { text, tail };
}

function addrSourceText(c: AddressCandidate): string {
  if (c.kind === 'purchase') return `bought ${c.date_label}`;
  if (c.kind === 'mail') return `from old mail, ${c.date_label} — unverified`;
  if (c.kind === 'database-current')
    return `current address in Tim's sales database, as of ${c.date_label}`;
  return 'moved to, per the file';
}

function buildNote(
  person: Person,
  addr: AddressChoice,
  base: Candidate | null
): string {
  const lines: string[] = [
    'Past client of the Fennessey Comeau Group. Deal history:',
  ];
  for (const e of person.timeline) {
    const verb =
      e.role === 'Bought & sold' ? 'Bought and sold' : e.role;
    lines.push(
      `• ${verb} ${e.address}${e.city ? `, ${e.city}` : ''}${
        e.price ? ` for ${e.price}` : ''
      } (${e.date_label || 'date unknown'}${e.source ? '; sales database' : ''}).`
    );
  }
  if (person.birthday_candidate) {
    lines.push(
      `Birthday: ${birthdayLabel(person)} (from ${person.birthday_candidate.source}).`
    );
  }
  if (person.anniversary_candidate) {
    lines.push(
      `Home purchase anniversary: ${fmtISO(person.anniversary_candidate.date)} — newest purchase, ${person.anniversary_candidate.address}${
        person.anniversary_candidate.source === "Tim's sales database"
          ? " (per Tim's sales database)"
          : ''
      }.`
    );
  }
  if (addr.choice === 'candidate' && addr.value) {
    const cand = person.address_candidates.find((c) => c.value === addr.value);
    lines.push(
      `Current address: ${addr.value}${cand ? ` (${addrSourceText(cand)})` : ''}.`
    );
  } else if (addr.choice === 'keep' && base?.address) {
    lines.push(`Current address on file: ${base.address}.`);
  } else {
    lines.push('Current address unknown.');
  }
  return lines.join('\n');
}

type AfterState = {
  name: string;
  email: string;
  email2: string;
  phone: string;
  phone2: string;
  address: string;
  changed: Record<string, boolean>;
};

function computeAfter(
  it: Item,
  person: Person,
  base: Candidate | null,
  assignMap: Record<string, string>,
  addr: AddressChoice
): AfterState {
  const fd = it.payload.file_details || { emails: [], phones: [] };
  const aEmails = fd.emails
    .filter((e) => assignMap[`e:${e.value}`] === person.person_key)
    .map((e) => e.value);
  const aPhones = fd.phones.filter(
    (ph) => assignMap[`p:${ph.digits}`] === person.person_key
  );
  let email = base?.email || '';
  let email2 = base?.secondary_email || '';
  for (const e of aEmails) {
    if (e.toLowerCase() === email.toLowerCase() || e.toLowerCase() === email2.toLowerCase())
      continue;
    if (!email) email = e;
    else if (!email2) email2 = e;
  }
  let phone = base?.phone || '';
  let phone2 = base?.secondary_phone || '';
  const have = new Set([digitsOf(phone), digitsOf(phone2)].filter(Boolean));
  for (const ph of aPhones) {
    if (have.has(ph.digits)) continue;
    if (!phone) phone = ph.value;
    else if (!phone2) phone2 = ph.value;
    have.add(ph.digits);
  }
  let address = '';
  if (addr.choice === 'keep') address = base?.address || '';
  else if (addr.choice === 'candidate') address = addr.value;
  return {
    name: base?.name || person.name,
    email,
    email2,
    phone: prettyPhone(phone),
    phone2: prettyPhone(phone2),
    address,
    changed: {
      email: email !== (base?.email || ''),
      email2: email2 !== (base?.secondary_email || ''),
      phone: digitsOf(phone) !== digitsOf(base?.phone || ''),
      phone2: digitsOf(phone2) !== digitsOf(base?.secondary_phone || ''),
      address: address !== (base?.address || ''),
    },
  };
}

function ItemCard({
  it,
  saving,
  legacySelected,
  onLegacySelect,
  onItemDecide,
  onSavePersons,
  decidedOpen,
  onCollapse,
}: {
  it: Item;
  saving: boolean;
  legacySelected: string;
  onLegacySelect: (cid: string) => void;
  onItemDecide: (d: 'add' | 'merge' | 'skip' | null, cid?: string | null) => void;
  onSavePersons: (pd: Record<string, PersonDecision>) => void;
  decidedOpen: boolean;
  onCollapse: () => void;
}) {
  const p = it.payload;
  const badge = STATUS_BADGE[it.match_status];
  const persons = personsOf(it);
  const hasPersons = persons.length > 0;
  const greyed = it.match_status === 'na';
  const fd = p.file_details || { emails: [], phones: [] };

  // ---- per-person working state (initialised from the saved record) ----
  const [selContact, setSelContact] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const person of persons) {
      const saved = it.person_decisions?.[person.person_key]?.contact_id;
      const strong = person.candidates.find((c) => c.strong_signal);
      out[person.person_key] =
        saved || strong?.contact_id || person.candidates[0]?.contact_id || '';
    }
    return out;
  });
  const [assignMap, setAssignMap] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const e of fd.emails)
      out[`e:${e.value}`] = e.default_person || 'none';
    for (const ph of fd.phones)
      out[`p:${ph.digits}`] = ph.default_person || 'none';
    const pd = it.person_decisions || {};
    for (const person of persons) {
      const a = pd[person.person_key]?.assign;
      if (a) {
        for (const em of a.emails) out[`e:${em}`] = person.person_key;
        for (const phv of a.phones) {
          const match = fd.phones.find((x) => x.value === phv);
          if (match) out[`p:${match.digits}`] = person.person_key;
        }
      }
    }
    return out;
  });
  const [addrSel, setAddrSel] = useState<Record<string, AddressChoice>>(() => {
    const out: Record<string, AddressChoice> = {};
    const pd = it.person_decisions || {};
    for (const person of persons) {
      const saved = pd[person.person_key]?.address;
      if (saved) {
        out[person.person_key] = saved;
        continue;
      }
      const savedCid = pd[person.person_key]?.contact_id;
      const strong = person.candidates.find((c) => c.strong_signal);
      const base =
        person.candidates.find((c) => c.contact_id === savedCid) ||
        strong ||
        person.candidates[0];
      if (base?.address) out[person.person_key] = { choice: 'keep', value: '' };
      else if (person.address_candidates.length)
        out[person.person_key] = {
          choice: 'candidate',
          value: person.address_candidates[0].value,
        };
      else out[person.person_key] = { choice: 'blank', value: '' };
    }
    return out;
  });
  const [localDec, setLocalDec] = useState<Record<string, PersonDecision>>(
    () => {
      const out: Record<string, PersonDecision> = {};
      const pd = it.person_decisions || {};
      for (const person of persons) {
        const d = pd[person.person_key];
        if (d?.decision)
          out[person.person_key] = {
            decision: d.decision,
            contact_id: d.contact_id ?? null,
          };
      }
      return out;
    }
  );
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});

  function buildPD(decisions: Record<string, PersonDecision>): Record<string, PersonDecision> {
    const out: Record<string, PersonDecision> = {};
    for (const person of persons) {
      const entry: PersonDecision = {
        assign: {
          emails: fd.emails
            .filter((e) => assignMap[`e:${e.value}`] === person.person_key)
            .map((e) => e.value),
          phones: fd.phones
            .filter((ph) => assignMap[`p:${ph.digits}`] === person.person_key)
            .map((ph) => ph.value),
        },
        address: addrSel[person.person_key] || { choice: 'blank', value: '' },
      };
      const dec = decisions[person.person_key];
      if (dec?.decision) {
        entry.decision = dec.decision;
        entry.contact_id =
          dec.decision === 'merge'
            ? selContact[person.person_key] || null
            : null;
      }
      out[person.person_key] = entry;
    }
    return out;
  }

  function decidePerson(person: Person, decision: 'merge' | 'add' | 'skip') {
    const next = {
      ...localDec,
      [person.person_key]: {
        decision,
        contact_id:
          decision === 'merge' ? selContact[person.person_key] || null : null,
      },
    };
    setLocalDec(next);
    onSavePersons(buildPD(next));
  }

  function changePerson(person: Person) {
    const next = { ...localDec };
    delete next[person.person_key];
    setLocalDec(next);
    onSavePersons(buildPD(next));
  }

  const itemLevelDecision =
    it.decision && ITEM_DECISIONS.includes(it.decision) ? it.decision : null;

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

        {/* RIGHT — per-person decisions, or the legacy panel */}
        <div className="p-5 bg-gray-50/60">
          {!hasPersons ? (
            <LegacyPanel
              it={it}
              saving={saving}
              selectedContact={legacySelected}
              onSelect={onLegacySelect}
              onDecide={onItemDecide}
              decidedOpen={decidedOpen}
              onCollapse={onCollapse}
            />
          ) : (
            <>
              {itemLevelDecision && (
                <div className="mb-4 rounded-lg bg-gray-100 border px-3.5 py-2.5 text-[13px] text-gray-700 flex flex-wrap items-center gap-2">
                  <span>
                    Whole item marked <strong>{decisionLabel(it)}</strong> —
                    that wins over the person choices below until you undo
                    it.
                  </span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => onItemDecide(null)}
                    className="ml-auto text-sm border rounded-full px-3 py-1 bg-white hover:bg-gray-50 disabled:opacity-50"
                    style={{ color: RED }}
                  >
                    Undo
                  </button>
                </div>
              )}

              {/* File detail assignment — emails only. Phone numbers are
                  out of scope for this cleanup (Nov 12, 2026). */}
              {fd.emails.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    File email addresses — whose are they?
                  </p>
                  <p className="text-xs text-gray-400 mb-2.5">
                    Each email goes to one person, or to nobody. Change any
                    of them, then use Save choices (or decide a person) to
                    keep the changes.
                  </p>
                  <div className="space-y-2">
                    {fd.emails.map((e) => (
                      <AssignRow
                        key={`e:${e.value}`}
                        label={e.value}
                        kindLabel="email"
                        sub={e.source ? `from ${e.source}` : undefined}
                        persons={persons}
                        value={assignMap[`e:${e.value}`] || 'none'}
                        onChange={(pk) =>
                          setAssignMap((m) => ({ ...m, [`e:${e.value}`]: pk }))
                        }
                      />
                    ))}
                  </div>
                  <div className="mt-2.5 text-right">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onSavePersons(buildPD(localDec))}
                      className="text-xs border rounded-full px-3 py-1.5 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save choices'}
                    </button>
                  </div>
                </div>
              )}

              {/* People */}
              <div className="space-y-4">
                {persons.map((person) => (
                  <PersonSection
                    key={person.person_key}
                    it={it}
                    person={person}
                    saving={saving}
                    selectedContact={selContact[person.person_key] || ''}
                    onSelectContact={(cid) =>
                      setSelContact((s) => ({ ...s, [person.person_key]: cid }))
                    }
                    addrChoice={
                      addrSel[person.person_key] || { choice: 'blank', value: '' }
                    }
                    onAddrChoice={(ac) => {
                      setAddrSel((s) => ({ ...s, [person.person_key]: ac }));
                      if (localDec[person.person_key]?.decision) {
                        onSavePersons(
                          buildPDWith(it, persons, assignMap, {
                            ...addrSel,
                            [person.person_key]: ac,
                          }, selContact, localDec, fd)
                        );
                      }
                    }}
                    savedDecision={localDec[person.person_key] || null}
                    onDecide={(d) => decidePerson(person, d)}
                    onChange={() => changePerson(person)}
                    assignMap={assignMap}
                    previewOpen={!!previewOpen[person.person_key]}
                    onTogglePreview={() =>
                      setPreviewOpen((s) => ({
                        ...s,
                        [person.person_key]: !s[person.person_key],
                      }))
                    }
                  />
                ))}
              </div>

              {/* Item-level shortcut */}
              <div className="mt-5 pt-4 border-t flex flex-wrap gap-2">
                {!itemLevelDecision && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => onItemDecide('skip')}
                    className={btnGhost}
                  >
                    Skip whole item
                  </button>
                )}
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

// buildPD variant that takes explicit state (used when saving straight
// after an address-choice change, before setAddrSel has flushed).
function buildPDWith(
  it: Item,
  persons: Person[],
  assignMap: Record<string, string>,
  addrSelMap: Record<string, AddressChoice>,
  selContact: Record<string, string>,
  decisions: Record<string, PersonDecision>,
  fd: { emails: FileDetailEmail[]; phones: FileDetailPhone[] }
): Record<string, PersonDecision> {
  const out: Record<string, PersonDecision> = {};
  for (const person of persons) {
    const entry: PersonDecision = {
      assign: {
        emails: fd.emails
          .filter((e) => assignMap[`e:${e.value}`] === person.person_key)
          .map((e) => e.value),
        phones: fd.phones
          .filter((ph) => assignMap[`p:${ph.digits}`] === person.person_key)
          .map((ph) => ph.value),
      },
      address: addrSelMap[person.person_key] || { choice: 'blank', value: '' },
    };
    const dec = decisions[person.person_key];
    if (dec?.decision) {
      entry.decision = dec.decision;
      entry.contact_id =
        dec.decision === 'merge' ? selContact[person.person_key] || null : null;
    }
    out[person.person_key] = entry;
  }
  return out;
}

function AssignRow({
  label,
  kindLabel,
  sub,
  persons,
  value,
  onChange,
}: {
  label: string;
  kindLabel: string;
  sub?: string;
  persons: Person[];
  value: string;
  onChange: (personKey: string) => void;
}) {
  return (
    <div className="bg-white border rounded-lg px-3.5 py-2.5 flex flex-wrap items-center gap-2">
      <span className="text-sm text-gray-700 break-all">
        <span className="text-gray-400 text-xs uppercase tracking-wide mr-1.5">
          {kindLabel}
        </span>
        {label}
        {sub && <span className="block text-xs text-gray-400">{sub}</span>}
      </span>
      <span className="ml-auto flex flex-wrap gap-1.5">
        {persons.length <= 3 ? (
          <>
            {persons.map((person) => (
              <button
                key={person.person_key}
                type="button"
                onClick={() => onChange(person.person_key)}
                className={`text-xs rounded-full px-2.5 py-1 border transition ${
                  value === person.person_key
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-500 hover:border-[#0f2a44]'
                }`}
                style={
                  value === person.person_key ? { background: NAVY } : undefined
                }
              >
                {person.first_name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange('none')}
              className={`text-xs rounded-full px-2.5 py-1 border transition ${
                value === 'none'
                  ? 'bg-gray-500 text-white border-transparent'
                  : 'bg-white text-gray-500 hover:border-gray-400'
              }`}
            >
              Don&apos;t add
            </button>
          </>
        ) : (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="text-sm border rounded-lg px-2 py-1 bg-white"
          >
            {persons.map((person) => (
              <option key={person.person_key} value={person.person_key}>
                {person.name}
              </option>
            ))}
            <option value="none">Don&apos;t add</option>
          </select>
        )}
      </span>
    </div>
  );
}


function PersonSection({
  it,
  person,
  saving,
  selectedContact,
  onSelectContact,
  addrChoice,
  onAddrChoice,
  savedDecision,
  onDecide,
  onChange,
  assignMap,
  previewOpen,
  onTogglePreview,
}: {
  it: Item;
  person: Person;
  saving: boolean;
  selectedContact: string;
  onSelectContact: (cid: string) => void;
  addrChoice: AddressChoice;
  onAddrChoice: (ac: AddressChoice) => void;
  savedDecision: PersonDecision | null;
  onDecide: (d: 'merge' | 'add' | 'skip') => void;
  onChange: () => void;
  assignMap: Record<string, string>;
  previewOpen: boolean;
  onTogglePreview: () => void;
}) {
  const base =
    person.candidates.find((c) => c.contact_id === selectedContact) || null;
  const tl = timelineText(person);
  const decided = savedDecision?.decision;
  const decidedContact =
    decided === 'merge'
      ? person.candidates.find(
          (c) => c.contact_id === savedDecision?.contact_id
        ) || base
      : base;

  const statusChip =
    person.candidates.length === 0
      ? { label: 'Not in database', cls: 'bg-gray-100 text-gray-600 border-gray-200' }
      : person.status === 'strong'
        ? { label: 'In your database', cls: 'bg-green-100 text-green-800 border-green-200' }
        : { label: 'Possible match', cls: 'bg-amber-100 text-amber-800 border-amber-200' };

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50/70 flex flex-wrap items-center gap-2">
        <p className="font-bold" style={{ color: NAVY }}>
          {person.name}
        </p>
        <span
          className={`text-[11px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${statusChip.cls}`}
        >
          {statusChip.label}
        </span>
        {decided && (
          <span className="ml-auto text-xs font-semibold rounded-full px-2.5 py-1 border bg-green-50 text-green-800 border-green-200">
            {decided === 'merge'
              ? `✓ Update ${decidedContact?.name || 'contact'}`
              : decided === 'add'
                ? '✓ Add as new'
                : '✓ Skip'}
          </span>
        )}
      </div>

      <div className="px-4 py-3">
        {person.repeats.length > 0 && (
          <p className="text-xs text-gray-500 mb-1.5">
            Also appears in: {person.repeats.join(' · ')}
          </p>
        )}
        {tl.text && (
          <p className="text-xs text-gray-500 leading-relaxed mb-1.5">
            <span className="font-semibold text-gray-400 uppercase tracking-wide mr-1">
              Timeline
            </span>
            {tl.text}
            {tl.tail && (
              <span className="block text-amber-700 mt-0.5">{tl.tail}</span>
            )}
          </p>
        )}
        {person.newest_address?.kind === 'sale-last-known' && (
          <p className="text-xs text-gray-500 mb-1.5">
            Last known: {person.newest_address.address} (sold{' '}
            {person.newest_address.date_label}) — they&apos;ve moved; current
            address unknown.
          </p>
        )}
        {person.newest_address &&
          person.newest_address.kind !== 'sale-last-known' && (
            <p className="text-xs text-gray-500 mb-1.5">
              Newest address: {person.newest_address.address} (
              {person.newest_address.source}
              {person.newest_address.date_label
                ? `, ${person.newest_address.date_label}`
                : ''}
              )
            </p>
          )}
        {person.birthday_candidate && (
          <p className="text-xs text-gray-600 mb-1.5">
            🎂 Birthday: {birthdayLabel(person)} — from{' '}
            {person.birthday_candidate.source} — will be added
          </p>
        )}
        {person.birthday_status === 'already_on_contact' && (
          <p className="text-xs text-gray-500 mb-1.5">
            🎂 Birthday already on their contact
            {person.birthday_existing
              ? ` (${fmtISO(person.birthday_existing)})`
              : ''}
          </p>
        )}
        {person.anniversary_candidate && (
          <p className="text-xs text-gray-600 mb-1.5">
            🏠 Home purchase anniversary: {fmtISO(person.anniversary_candidate.date)}{' '}
            ({person.anniversary_candidate.address}) — will be set from
            their newest purchase
            {person.anniversary_candidate.source === "Tim's sales database"
              ? " (per Tim's sales database)"
              : ''}
          </p>
        )}
        {person.anniversary_status === 'already_on_contact' && (
          <p className="text-xs text-gray-500 mb-1.5">
            🏠 Home purchase anniversary already set:{' '}
            {fmtISO(person.anniversary_existing)}
          </p>
        )}
        {person.google_phone && (
          <p className="text-xs text-gray-400 mb-1.5">
            Google Contacts has their cell: {person.google_phone} — numbers
            aren&apos;t changed in this cleanup
          </p>
        )}

        {/* Match / candidate selection */}
        {person.candidates.length === 0 && (
          <p className="text-sm text-gray-600 mb-3">
            Not in your database. Add them as a new contact — with the
            details assigned to them above and a note covering all their
            deals — or skip this person.
          </p>
        )}
        {person.candidates.length === 1 && (
          <div className="mb-3">
            <ContactBox c={person.candidates[0]} />
          </div>
        )}
        {person.candidates.length > 1 && (
          <div className="space-y-2.5 mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Could be one of these — pick the right one
            </p>
            {person.candidates.map((c) => (
              <label
                key={c.contact_id}
                className={`block border rounded-lg px-3.5 py-3 cursor-pointer transition ${
                  selectedContact === c.contact_id
                    ? 'border-[#0f2a44] ring-1 ring-[#0f2a44] bg-white'
                    : 'bg-white hover:border-gray-300'
                }`}
              >
                <span className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name={`cand-${it.item_key}-${person.person_key}`}
                    className="mt-1"
                    checked={selectedContact === c.contact_id}
                    onChange={() => onSelectContact(c.contact_id)}
                  />
                  <span className="flex-1">
                    <span
                      className="block font-semibold text-sm"
                      style={{ color: NAVY }}
                    >
                      {c.name}
                    </span>
                    <span className="block text-xs text-gray-500">
                      Matched on: {c.matched_on.join(' · ')}
                    </span>
                    <span className="block text-sm text-gray-600">
                      {c.email || 'No email on file'}
                      {c.phone ? ` · ${prettyPhone(c.phone)}` : ''}
                      {c.address ? ` · ${c.address}` : ''}
                    </span>
                    <DiffList c={c} />
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Address choice */}
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
            Their address
          </p>
          <div className="space-y-1.5">
            {person.address_candidates.map((c) => {
              const id = `addr-${it.item_key}-${person.person_key}-${c.value}`;
              const checked =
                addrChoice.choice === 'candidate' && addrChoice.value === c.value;
              return (
                <label
                  key={id}
                  className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 cursor-pointer text-sm ${
                    checked
                      ? 'border-[#0f2a44] ring-1 ring-[#0f2a44] bg-white'
                      : 'bg-white hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name={`addr-${it.item_key}-${person.person_key}`}
                    className="mt-0.5"
                    checked={checked}
                    onChange={() =>
                      onAddrChoice({ choice: 'candidate', value: c.value })
                    }
                  />
                  <span>
                    <span className="text-gray-800">
                      Add as new address: <strong>{c.value}</strong>
                    </span>
                    <span className="block text-xs text-gray-500">
                      {c.source}
                      {c.date_label ? ` · ${c.date_label}` : ''}
                      {c.sold_later ? ' · later sold' : ''}
                    </span>
                  </span>
                </label>
              );
            })}
            {base?.address && (
              <label
                className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 cursor-pointer text-sm ${
                  addrChoice.choice === 'keep'
                    ? 'border-[#0f2a44] ring-1 ring-[#0f2a44] bg-white'
                    : 'bg-white hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={`addr-${it.item_key}-${person.person_key}`}
                  className="mt-0.5"
                  checked={addrChoice.choice === 'keep'}
                  onChange={() => onAddrChoice({ choice: 'keep', value: '' })}
                />
                <span className="text-gray-800">
                  Leave what&apos;s on file: <strong>{base.address}</strong>
                </span>
              </label>
            )}
            <label
              className={`flex items-start gap-2.5 border rounded-lg px-3 py-2 cursor-pointer text-sm ${
                addrChoice.choice === 'blank'
                  ? 'border-[#0f2a44] ring-1 ring-[#0f2a44] bg-white'
                  : 'bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name={`addr-${it.item_key}-${person.person_key}`}
                className="mt-0.5"
                checked={addrChoice.choice === 'blank'}
                onChange={() => onAddrChoice({ choice: 'blank', value: '' })}
              />
              <span className="text-gray-800">
                Keep blank — I&apos;ll fill it in myself
              </span>
            </label>
          </div>
        </div>

        {/* Decision buttons / saved state */}
        {!decided ? (
          <div className="flex flex-wrap gap-2">
            {person.candidates.length > 0 && (
              <button
                type="button"
                disabled={saving || !selectedContact}
                onClick={() => onDecide('merge')}
                className={btnPrimary}
                style={{ background: RED }}
              >
                {saving
                  ? 'Saving…'
                  : `Update ${base?.name || 'this contact'}`}
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => onDecide('add')}
              className={person.candidates.length > 0 ? btnGhost : btnPrimary}
              style={person.candidates.length > 0 ? undefined : { background: RED }}
            >
              {saving
                ? 'Saving…'
                : person.candidates.length > 0
                  ? 'Add as new instead'
                  : 'Add as new contact'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onDecide('skip')}
              className={btnGhost}
            >
              Skip this person
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onChange}
              className={btnGhost}
            >
              {saving ? 'Saving…' : 'Change'}
            </button>
          </div>
        )}

        {/* Preview */}
        <div className="mt-3">
          <button
            type="button"
            onClick={onTogglePreview}
            className="text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-[#0f2a44] transition"
          >
            {previewOpen ? '▾' : '▸'} What will go on their card
          </button>
          {previewOpen && (
            <PreviewPanel
              it={it}
              person={person}
              base={decided === 'add' ? null : decidedContact}
              assignMap={assignMap}
              addrChoice={addrChoice}
              skipped={decided === 'skip'}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({
  it,
  person,
  base,
  assignMap,
  addrChoice,
  skipped,
}: {
  it: Item;
  person: Person;
  base: Candidate | null;
  assignMap: Record<string, string>;
  addrChoice: AddressChoice;
  skipped: boolean;
}) {
  if (skipped) {
    return (
      <div className="mt-2 border rounded-lg px-3.5 py-3 bg-gray-50 text-sm text-gray-500">
        Skipped — nothing will go on their card.
      </div>
    );
  }
  const after = computeAfter(it, person, base, assignMap, addrChoice);
  const note = buildNote(person, addrChoice, base);
  const rows: { label: string; value: string; changed: boolean }[] = [
    { label: 'Name', value: after.name, changed: false },
    {
      label: 'Email',
      value: after.email || '—',
      changed: after.changed.email,
    },
    ...(after.email2
      ? [
          {
            label: 'Second email',
            value: after.email2,
            changed: after.changed.email2,
          },
        ]
      : []),
    {
      label: 'Phone',
      value: after.phone || '—',
      changed: after.changed.phone,
    },
    ...(after.phone2
      ? [
          {
            label: 'Second phone',
            value: after.phone2,
            changed: after.changed.phone2,
          },
        ]
      : []),
    {
      label: 'Address',
      value: after.address || '— (left blank)',
      changed: after.changed.address,
    },
    ...(person.birthday_status === 'already_on_contact'
      ? [
          {
            label: 'Birthday',
            value: fmtISO(person.birthday_existing) || '—',
            changed: false,
          },
        ]
      : person.birthday_candidate
        ? [
            {
              label: 'Birthday',
              value: `${birthdayLabel(person)} (from ${person.birthday_candidate.source})`,
              changed: true,
            },
          ]
        : []),
    ...(person.anniversary_status === 'already_on_contact'
      ? [
          {
            label: 'Home purchase anniversary',
            value: fmtISO(person.anniversary_existing) || '—',
            changed: false,
          },
        ]
      : person.anniversary_candidate
        ? [
            {
              label: 'Home purchase anniversary',
              value: `${fmtISO(person.anniversary_candidate.date)} — ${person.anniversary_candidate.address}${
                person.anniversary_candidate.source === "Tim's sales database"
                  ? " (Tim's sales database)"
                  : ''
              }`,
              changed: true,
            },
          ]
        : []),
  ];
  return (
    <div className="mt-2 border rounded-lg px-3.5 py-3 bg-gray-50">
      <dl className="space-y-1.5 text-sm mb-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`flex gap-2 rounded px-1.5 py-0.5 ${
              r.changed ? 'bg-amber-100/70' : ''
            }`}
          >
            <dt className="w-28 shrink-0 text-gray-400">{r.label}</dt>
            <dd className="text-gray-800 break-all">
              {r.value}
              {r.changed && (
                <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                  {base ? 'will change' : 'new'}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs font-semibold text-gray-500 mb-1">
        Note that will be added:
      </p>
      <pre className="whitespace-pre-wrap text-[13px] text-gray-700 bg-white border rounded-lg px-3 py-2.5 font-sans">
        {note}
      </pre>
    </div>
  );
}

// Legacy panel — items seeded before the per-person rework (no persons
// array in the payload). Same choices as the original page.
function LegacyPanel({
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
  onDecide: (d: 'add' | 'merge' | 'skip' | null, cid?: string | null) => void;
  decidedOpen: boolean;
  onCollapse: () => void;
}) {
  if (it.match_status === 'na') {
    return (
      <>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          You weren&apos;t their agent on this one — nothing to import.
        </p>
        <div className="flex flex-wrap gap-2">
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
    );
  }

  if (it.match_status === 'none') {
    return (
      <>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          Not in your database. Add them as a new contact — with the details
          from the file and a note on this deal — or skip.
        </p>
        <div className="flex flex-wrap gap-2">
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
    );
  }

  if (it.match_status === 'strong' && it.match_candidates[0]) {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
          Already in your database
        </p>
        <div className="mb-3">
          <ContactBox c={it.match_candidates[0]} />
        </div>
        <p className="text-xs text-gray-400 leading-relaxed mb-3">
          Updating fills in blanks only — anything already on the contact
          stays exactly as it is.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => onDecide('merge', it.match_candidates[0].contact_id)}
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
    );
  }

  // possible
  return (
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
                <span
                  className="block font-semibold text-sm"
                  style={{ color: NAVY }}
                >
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
      <div className="flex flex-wrap gap-2">
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
  );
}

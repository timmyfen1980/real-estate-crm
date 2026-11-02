/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';

interface HoursEntry {
  id: string;
  work_date: string;
  hours: number | string;
  note: string | null;
  invoice_id: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: number;
  period_start: string | null;
  period_end: string | null;
  total_hours: number | string;
  rate: number | string;
  subtotal: number | string;
  hst_number: string | null;
  hst_amount: number | string;
  total: number | string;
  status: string;
  issued_at: string;
  paid_at: string | null;
}

interface HoursData {
  viewer: { isOwner: boolean; isBeth: boolean };
  settings: { rate: number; hst_number: string | null };
  entries: HoursEntry[];
  invoices: Invoice[];
  totals: {
    uninvoiced_hours: number;
    uninvoiced_amount: number;
    unpaid_invoice_total: number;
  };
}

const NAVY = '#0f2a44';
const RED = '#d22630';

function num(v: number | string): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function money(n: number): string {
  return `$${n.toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function todayInToronto(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '20px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 20px',
  background: RED,
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '14px',
  cursor: 'pointer',
};

const plainBtn: React.CSSProperties = {
  padding: '7px 14px',
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280',
  padding: '8px 10px',
  borderBottom: '2px solid #e5e7eb',
};

const tdStyle: React.CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '14px',
  color: '#1f2937',
  verticalAlign: 'top',
};

export default function BethHoursPage() {
  const [data, setData] = useState<HoursData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');

  // Entry form
  const [workDate, setWorkDate] = useState(todayInToronto());
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Settings form (Tim)
  const [rateInput, setRateInput] = useState('');
  const [hstInput, setHstInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/hours');
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load hours.');
      setData(json);
      setRateInput(String(json.settings.rate));
      setHstInput(json.settings.hst_number || '');
    } catch (err: any) {
      setError(err.message || 'Could not load hours.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveEntry() {
    const hrs = parseFloat(hours);
    if (!workDate) {
      alert('Pick the day you worked.');
      return;
    }
    if (!(hrs > 0) || hrs > 24) {
      alert('Hours must be more than 0 and no more than 24.');
      return;
    }
    setSaving(true);
    try {
      const payload = { work_date: workDate, hours: hrs, note: note.trim() || null };
      const res = editingId
        ? await fetch(`/api/hours/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/hours', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save.');
      setEditingId(null);
      setHours('');
      setNote('');
      setWorkDate(todayInToronto());
      await load();
    } catch (err: any) {
      alert(err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(e: HoursEntry) {
    setEditingId(e.id);
    setWorkDate(e.work_date);
    setHours(String(num(e.hours)));
    setNote(e.note || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setHours('');
    setNote('');
    setWorkDate(todayInToronto());
  }

  async function handleDelete(e: HoursEntry) {
    if (!window.confirm(`Delete the ${num(e.hours)} hours from ${fmtDate(e.work_date)}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hours/${e.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not delete.');
      if (editingId === e.id) cancelEdit();
      await load();
    } catch (err: any) {
      alert(err.message || 'Could not delete.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateInvoice() {
    if (!data) return;
    const t = data.totals;
    if (
      !window.confirm(
        `Make an invoice for ${t.uninvoiced_hours} hours (${money(t.uninvoiced_amount)} before any HST)? Those hours will lock onto the invoice and cannot be changed or billed again.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch('/api/hours/invoice', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not make the invoice.');
      await load();
    } catch (err: any) {
      alert(err.message || 'Could not make the invoice.');
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkPaid(inv: Invoice) {
    if (!window.confirm(`Mark invoice #${inv.invoice_number} (${money(num(inv.total))}) as paid?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hours/invoice/${inv.id}/paid`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not mark it paid.');
      await load();
    } catch (err: any) {
      alert(err.message || 'Could not mark it paid.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSettings() {
    const rate = parseFloat(rateInput);
    if (!(rate > 0)) {
      alert('The hourly rate must be more than 0.');
      return;
    }
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      const res = await fetch('/api/hours/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate, hst_number: hstInput.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save settings.');
      setSettingsSaved(true);
      await load();
    } catch (err: any) {
      alert(err.message || 'Could not save settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  if (loading) return <p>Loading...</p>;

  if (forbidden) {
    return (
      <div style={cardStyle}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Beth&apos;s Hours</h1>
        <p style={{ color: '#6b7280', margin: 0 }}>This page is only for Beth and Tim.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={cardStyle}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Beth&apos;s Hours</h1>
        <p style={{ color: '#b91c1c', margin: 0 }}>{error || 'Something went wrong loading this page.'}</p>
      </div>
    );
  }

  const isOwner = data.viewer.isOwner;
  const isBeth = data.viewer.isBeth;
  const rate = data.settings.rate;
  const hasHst = Boolean(data.settings.hst_number);
  const t = data.totals;
  const invoiceNumberById = new Map(data.invoices.map((i) => [i.id, i.invoice_number]));
  const hasUninvoiced = t.uninvoiced_hours > 0;

  return (
    <div style={{ maxWidth: '980px' }}>
      <h1 style={{ fontSize: '26px', fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>
        {isBeth && !isOwner ? 'My Hours' : "Beth's Hours"}
      </h1>
      <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 20px' }}>
        {isBeth && !isOwner
          ? 'Add the hours you work here. Tim can see them right away. When it is time to bill, make an invoice — the hours on it lock so they can never be billed twice.'
          : 'Beth logs her hours here as she works. This page always shows what she has logged and what is owing.'}
      </p>

      {/* Owing summary */}
      <div style={{ ...cardStyle, borderLeft: `5px solid ${RED}` }}>
        {isOwner ? (
          <>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Owing now (not on an invoice yet)
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: NAVY, margin: '6px 0' }}>
              {money(t.uninvoiced_amount)}
            </div>
            <p style={{ color: '#4b5563', fontSize: '14px', margin: 0 }}>
              {t.uninvoiced_hours} hours at {money(rate)} per hour.
              {hasHst
                ? ` With 13% HST that is ${money(Math.round(t.uninvoiced_amount * 1.13 * 100) / 100)}.`
                : ' Plus 13% HST once her HST number is on file — right now her invoices carry no HST.'}
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Not on an invoice yet
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: NAVY, margin: '6px 0' }}>
              {t.uninvoiced_hours} hours · {money(t.uninvoiced_amount)}
            </div>
            <p style={{ color: '#4b5563', fontSize: '14px', margin: 0 }}>
              At {money(rate)} per hour.
              {!hasHst && ' No HST for now — you do not have an HST number on file yet.'}
            </p>
          </>
        )}
        {t.unpaid_invoice_total > 0 && (
          <p style={{ color: '#4b5563', fontSize: '14px', margin: '10px 0 0' }}>
            Invoices waiting to be paid: <strong>{money(t.unpaid_invoice_total)}</strong>
          </p>
        )}
        <div style={{ marginTop: '16px' }}>
          <button onClick={handleCreateInvoice} disabled={!hasUninvoiced || busy} style={{ ...primaryBtn, opacity: !hasUninvoiced || busy ? 0.55 : 1 }}>
            Make an invoice from these hours
          </button>
          {!hasUninvoiced && (
            <span style={{ marginLeft: '12px', fontSize: '13px', color: '#9ca3af' }}>
              Nothing to invoice yet — every hour logged so far is already on an invoice.
            </span>
          )}
        </div>
      </div>

      {/* Add / edit entry (Beth only) */}
      {isBeth && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: '0 0 14px' }}>
            {editingId ? 'Fix this entry' : 'Add your hours'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 140px 1fr', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Day you worked</label>
              <input style={inputStyle} type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Hours</label>
              <input style={inputStyle} type="number" min="0" max="24" step="0.25" placeholder="e.g. 3.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>What did you work on?</label>
              <input style={inputStyle} type="text" placeholder="e.g. Client files and booking showings" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button onClick={handleSaveEntry} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : editingId ? 'Save the fix' : 'Add these hours'}
            </button>
            {editingId && (
              <button onClick={cancelEdit} style={plainBtn}>Cancel</button>
            )}
          </div>
        </div>
      )}

      {/* Entries */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>Hours logged</h2>
        {data.entries.length === 0 ? (
          <p style={{ color: '#6b7280', margin: '8px 0 0' }}>No hours logged yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Day</th>
                <th style={thStyle}>What the work was</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Hours</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                <th style={thStyle}>Status</th>
                {isBeth && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => {
                const locked = Boolean(e.invoice_id);
                return (
                  <tr key={e.id} style={locked ? { background: '#fafafa' } : undefined}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(e.work_date)}</td>
                    <td style={tdStyle}>{e.note || ''}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{num(e.hours).toFixed(2)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{money(num(e.hours) * rate)}</td>
                    <td style={tdStyle}>
                      {locked ? (
                        <span style={{ background: '#eef2f7', color: NAVY, padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          On invoice #{e.invoice_id ? invoiceNumberById.get(e.invoice_id) ?? '' : ''} · locked
                        </span>
                      ) : (
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          Not invoiced yet
                        </span>
                      )}
                    </td>
                    {isBeth && (
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        {!locked && (
                          <>
                            <button onClick={() => startEdit(e)} style={{ ...plainBtn, marginRight: '6px' }}>Fix</button>
                            <button onClick={() => handleDelete(e)} disabled={busy} style={{ ...plainBtn, color: '#dc2626', borderColor: '#fecaca', background: 'white' }}>Delete</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Invoices */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>Invoices</h2>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 12px' }}>
          From Beth Nickle to Tim Fennessey Personal Real Estate Corporation.
        </p>
        {data.invoices.length === 0 ? (
          <p style={{ color: '#6b7280', margin: 0 }}>No invoices yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Invoice</th>
                <th style={thStyle}>Work period</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Hours</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                <th style={thStyle}>Paid?</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td style={tdStyle}>
                    <strong>#{inv.invoice_number}</strong>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>Made {fmtDate(inv.issued_at)}</div>
                  </td>
                  <td style={tdStyle}>
                    {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{num(inv.total_hours).toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {money(num(inv.total))}
                    {num(inv.hst_amount) > 0 && (
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>incl. {money(num(inv.hst_amount))} HST</div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {inv.status === 'paid' ? (
                      <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        Paid{inv.paid_at ? ` ${fmtDate(inv.paid_at)}` : ''}
                      </span>
                    ) : (
                      <span style={{ background: '#fee2e2', color: '#991b1b', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        Not paid yet
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <a href={`/api/hours/invoice/${inv.id}/pdf`} style={{ ...plainBtn, textDecoration: 'none', display: 'inline-block', marginRight: isOwner && inv.status !== 'paid' ? '6px' : 0 }}>
                      Download PDF
                    </a>
                    {isOwner && inv.status !== 'paid' && (
                      <button onClick={() => handleMarkPaid(inv)} disabled={busy} style={{ ...plainBtn, background: NAVY, color: 'white', borderColor: NAVY }}>
                        Mark paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Settings (Tim only) */}
      {isOwner && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>Settings</h2>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 14px' }}>
            Beth&apos;s pay rate and HST number. Her invoices only charge HST once her HST number is saved here.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 260px', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Hourly rate ($)</label>
              <input style={inputStyle} type="number" min="0" step="0.5" value={rateInput} onChange={(e) => setRateInput(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Beth&apos;s HST number</label>
              <input style={inputStyle} type="text" placeholder="Blank until she registers" value={hstInput} onChange={(e) => setHstInput(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={handleSaveSettings} disabled={savingSettings} style={{ ...primaryBtn, opacity: savingSettings ? 0.6 : 1 }}>
              {savingSettings ? 'Saving...' : 'Save settings'}
            </button>
            {settingsSaved && <span style={{ color: '#166534', fontSize: '13px', fontWeight: 600 }}>Saved.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

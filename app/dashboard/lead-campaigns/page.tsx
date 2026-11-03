/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';

interface CampaignCounts {
  pulled: number;
  contacted: number;
  clients: number;
  deals: number;
}

interface LeadCampaign {
  id: string;
  name: string;
  slug: string;
  goal: string;
  channel: string;
  capture_type: string;
  capture_url: string;
  tracked_url: string;
  caption: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  counts: CampaignCounts;
}

const NAVY = '#0f2a44';
const RED = '#d22630';

const GOAL_OPTIONS = [
  { value: 'sellers', label: 'Sellers' },
  { value: 'buyers', label: 'Buyers' },
  { value: 'area', label: 'Area / neighbourhood' },
  { value: 'general', label: 'General' },
];

const CAPTURE_OPTIONS = [
  { value: 'valuation', label: 'Home Valuation' },
  { value: 'watch', label: 'Watch My Area' },
  { value: 'giveaway', label: 'Giveaway' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'ended', label: 'Ended' },
];

function goalLabel(v: string): string {
  return GOAL_OPTIONS.find((o) => o.value === v)?.label || v;
}

function captureLabel(v: string): string {
  return CAPTURE_OPTIONS.find((o) => o.value === v)?.label || v;
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

export default function LeadCampaignsPage() {
  const [campaigns, setCampaigns] = useState<LeadCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('sellers');
  const [captureType, setCaptureType] = useState('valuation');
  const [newCaption, setNewCaption] = useState('');
  const [creating, setCreating] = useState(false);

  // Per-campaign caption drafts + copy feedback
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState('');
  const [savingId, setSavingId] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/lead-campaigns');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load campaigns.');
      setCampaigns(json.campaigns || []);
      const drafts: Record<string, string> = {};
      for (const c of json.campaigns || []) {
        drafts[c.id] = c.caption || '';
      }
      setCaptions(drafts);
    } catch (err: any) {
      setError(err.message || 'Could not load campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch {
      alert('Copy failed — select the text and copy it manually.');
    }
  }

  async function handleCreate() {
    if (!name.trim()) {
      alert('Give the campaign a name.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/lead-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          goal,
          capture_type: captureType,
          caption: newCaption,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not create campaign.');
      setName('');
      setNewCaption('');
      await load();
    } catch (err: any) {
      alert(err.message || 'Could not create campaign.');
    } finally {
      setCreating(false);
    }
  }

  async function patchCampaign(id: string, updates: Record<string, any>) {
    setSavingId(id);
    try {
      const res = await fetch('/api/lead-campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save.');
      await load();
    } catch (err: any) {
      alert(err.message || 'Could not save.');
    } finally {
      setSavingId('');
    }
  }

  if (loading) {
    return <div style={{ padding: '24px' }}>Loading campaigns…</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 800,
          color: NAVY,
          marginBottom: '4px',
        }}
      >
        Lead Campaigns
      </h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
        Create a campaign, paste its tracked link into your social post, and
        every lead it pulls is stamped and counted here.
      </p>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '14px',
            marginBottom: '20px',
          }}
        >
          {error}
        </div>
      )}

      {/* Create */}
      <div style={cardStyle}>
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: NAVY,
            marginBottom: '14px',
          }}
        >
          New campaign
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '14px',
            marginBottom: '14px',
          }}
        >
          <div>
            <label style={labelStyle}>Campaign name</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. November Whitby Sellers"
            />
          </div>
          <div>
            <label style={labelStyle}>Goal</label>
            <select
              style={inputStyle}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            >
              {GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Capture page</label>
            <select
              style={inputStyle}
              value={captureType}
              onChange={(e) => setCaptureType(e.target.value)}
            >
              {CAPTURE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Post caption (optional)</label>
          <textarea
            style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }}
            value={newCaption}
            onChange={(e) => setNewCaption(e.target.value)}
            placeholder="Write the post copy here, or ask Rea to draft it — it stays saved with the campaign, ready to paste."
          />
        </div>
        <button
          style={primaryBtn}
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? 'Creating…' : 'Create campaign'}
        </button>
      </div>

      {/* Board */}
      {campaigns.length === 0 && !error && (
        <div style={{ ...cardStyle, color: '#6b7280', fontSize: '14px' }}>
          No campaigns yet — create one above, drop its tracked link into a
          post, and the leads it pulls will show up here.
        </div>
      )}

      {campaigns.map((c) => (
        <div key={c.id} style={cardStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
              marginBottom: '10px',
            }}
          >
            <div>
              <div
                style={{ fontSize: '17px', fontWeight: 700, color: NAVY }}
              >
                {c.name}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280' }}>
                {goalLabel(c.goal)} · {captureLabel(c.capture_type)} · Social
              </div>
            </div>
            <select
              value={c.status}
              disabled={savingId === c.id}
              onChange={(e) => patchCampaign(c.id, { status: e.target.value })}
              style={{
                padding: '7px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '10px',
              marginBottom: '14px',
            }}
          >
            {(
              [
                ['Leads pulled', c.counts.pulled],
                ['Contacted', c.counts.contacted],
                ['Clients', c.counts.clients],
                ['Deals', c.counts.deals],
              ] as [string, number][]
            ).map(([label, value]) => (
              <div
                key={label}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{ fontSize: '20px', fontWeight: 800, color: NAVY }}
                >
                  {value}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          <label style={labelStyle}>Tracked link — paste this in the post</label>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <code
              style={{
                flex: 1,
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '9px 12px',
                fontSize: '13px',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              {c.tracked_url}
            </code>
            <button
              style={plainBtn}
              onClick={() => copyText(`link-${c.id}`, c.tracked_url)}
            >
              {copiedKey === `link-${c.id}` ? 'Copied ✓' : 'Copy link'}
            </button>
          </div>

          <label style={labelStyle}>Post caption</label>
          <textarea
            style={{
              ...inputStyle,
              minHeight: '72px',
              resize: 'vertical',
              marginBottom: '8px',
            }}
            value={captions[c.id] ?? ''}
            onChange={(e) =>
              setCaptions((prev) => ({ ...prev, [c.id]: e.target.value }))
            }
            placeholder="The post copy for this campaign — ask Rea to draft it, then keep it here ready to paste."
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={plainBtn}
              disabled={savingId === c.id}
              onClick={() =>
                patchCampaign(c.id, { caption: captions[c.id] ?? '' })
              }
            >
              {savingId === c.id ? 'Saving…' : 'Save caption'}
            </button>
            <button
              style={plainBtn}
              onClick={() => copyText(`caption-${c.id}`, captions[c.id] ?? '')}
            >
              {copiedKey === `caption-${c.id}` ? 'Copied ✓' : 'Copy caption'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

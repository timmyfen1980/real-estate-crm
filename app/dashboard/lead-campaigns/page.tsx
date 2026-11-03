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
  budget_amount: number | null;
  budget_days: number | null;
  audience: string | null;
  meta_campaign_id: string | null;
  meta_status: string | null;
  spend: number | null;
  created_by: string | null;
  created_at: string;
  counts: CampaignCounts;
}

interface CampaignIdea {
  id: string;
  play: string;
  title: string;
  subject: string | null;
  hook: string | null;
  suggested_caption: string | null;
  capture_type: string;
  goal: string;
  suggested_budget: number | null;
  suggested_days: number | null;
  audience: string | null;
  source_ref: string | null;
  status: string;
  built_campaign_id: string | null;
  created_at: string;
  expires_at: string | null;
}

const PLAY_LABELS: Record<string, string> = {
  seller_push: 'Seller push',
  new_listing: 'New listing',
  sold: 'Sold',
  improved_price: 'Improved price',
  open_house: 'Open house',
  market_update: 'Market update',
  giveaway: 'Giveaway',
  expired_area: 'Expired area',
  winner_clone: 'Run it again',
};

const META_LABELS: Record<string, string> = {
  not_sent: 'Not sent to Meta',
  creating: 'Sending to Meta…',
  paused: 'Paused in Meta',
  live: 'Live',
  ended: 'Ended',
};

function playLabel(v: string): string {
  return PLAY_LABELS[v] || v;
}

function metaLabel(v: string | null): string {
  if (!v) return META_LABELS.not_sent;
  return META_LABELS[v] || v;
}

function money(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
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
  const [ideas, setIdeas] = useState<CampaignIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('sellers');
  const [captureType, setCaptureType] = useState('valuation');
  const [newCaption, setNewCaption] = useState('');
  const [newBudget, setNewBudget] = useState('');
  const [newDays, setNewDays] = useState('');
  const [newAudience, setNewAudience] = useState('');
  const [creating, setCreating] = useState(false);
  const [ideaBusyId, setIdeaBusyId] = useState('');

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
      setIdeas(json.ideas || []);
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
          budget_amount: newBudget.trim() === '' ? null : Number(newBudget),
          budget_days: newDays.trim() === '' ? null : Number(newDays),
          audience: newAudience,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not create campaign.');
      setName('');
      setNewCaption('');
      setNewBudget('');
      setNewDays('');
      setNewAudience('');
      await load();
    } catch (err: any) {
      alert(err.message || 'Could not create campaign.');
    } finally {
      setCreating(false);
    }
  }

  async function ideaAction(idea: CampaignIdea, action: 'build' | 'dismiss') {
    setIdeaBusyId(idea.id);
    try {
      const res = await fetch(
        `/api/lead-campaigns/ideas/${idea.id}/${action}`,
        { method: 'POST' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not do that.');
      await load();
    } catch (err: any) {
      alert(err.message || 'Could not do that.');
    } finally {
      setIdeaBusyId('');
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

      {/* Ideas from Rea */}
      <h2
        style={{
          fontSize: '16px',
          fontWeight: 700,
          color: NAVY,
          marginBottom: '12px',
        }}
      >
        Ideas from Rea
      </h2>
      {ideas.length === 0 && (
        <div style={{ ...cardStyle, color: '#6b7280', fontSize: '14px' }}>
          No ideas right now — Rea adds new ones as listings, sales and open
          houses happen.
        </div>
      )}
      {ideas.map((idea) => (
        <div key={idea.id} style={cardStyle}>
          <div
            style={{
              display: 'inline-block',
              background: '#eef2f7',
              color: NAVY,
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '999px',
              padding: '3px 10px',
              marginBottom: '8px',
            }}
          >
            {playLabel(idea.play)}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: NAVY }}>
            {idea.title}
          </div>
          {idea.subject && (
            <div
              style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}
            >
              {idea.subject}
            </div>
          )}
          {idea.hook && (
            <div style={{ fontSize: '14px', color: '#374151', marginTop: '8px' }}>
              {idea.hook}
            </div>
          )}
          <div
            style={{
              fontSize: '13px',
              color: '#6b7280',
              marginTop: '8px',
            }}
          >
            {[
              idea.suggested_budget != null
                ? `$${money(Number(idea.suggested_budget))}${
                    idea.suggested_days ? ` over ${idea.suggested_days} days` : ''
                  }`
                : idea.suggested_days
                  ? `${idea.suggested_days} days`
                  : null,
              idea.audience,
              `${goalLabel(idea.goal)} · ${captureLabel(idea.capture_type)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button
              style={primaryBtn}
              disabled={ideaBusyId === idea.id}
              onClick={() => ideaAction(idea, 'build')}
            >
              {ideaBusyId === idea.id ? 'Working…' : 'Build this campaign'}
            </button>
            <button
              style={plainBtn}
              disabled={ideaBusyId === idea.id}
              onClick={() => ideaAction(idea, 'dismiss')}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}

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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 2fr',
            gap: '14px',
            marginBottom: '14px',
          }}
        >
          <div>
            <label style={labelStyle}>Budget $ (optional)</label>
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="any"
              value={newBudget}
              onChange={(e) => setNewBudget(e.target.value)}
              placeholder="e.g. 75"
            />
          </div>
          <div>
            <label style={labelStyle}>Days (optional)</label>
            <input
              style={inputStyle}
              type="number"
              min="1"
              step="1"
              value={newDays}
              onChange={(e) => setNewDays(e.target.value)}
              placeholder="e.g. 5"
            />
          </div>
          <div>
            <label style={labelStyle}>Audience (optional)</label>
            <input
              style={inputStyle}
              value={newAudience}
              onChange={(e) => setNewAudience(e.target.value)}
              placeholder="e.g. Homeowners in Whitby, 35+"
            />
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
          No campaigns yet — build one of Rea&apos;s ideas above or create
          one of your own, drop its tracked link into a post, and the leads
          it pulls will show up here.
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

          {(c.budget_amount != null || c.audience) && (
            <div
              style={{ fontSize: '13px', color: '#374151', marginBottom: '6px' }}
            >
              {[
                c.budget_amount != null
                  ? `$${money(Number(c.budget_amount))}${
                      c.budget_days ? ` over ${c.budget_days} days` : ''
                    }`
                  : null,
                c.audience,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
          <div
            style={{ fontSize: '13px', color: '#374151', marginBottom: '6px' }}
          >
            Meta: {metaLabel(c.meta_status)}
            {c.meta_campaign_id ? ` · Campaign ID ${c.meta_campaign_id}` : ''}
          </div>
          {Number(c.spend || 0) > 0 && (
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: NAVY,
                marginBottom: '6px',
              }}
            >
              {c.counts.pulled > 0
                ? `Spent $${money(Number(c.spend))} · $${(
                    Number(c.spend) / c.counts.pulled
                  ).toFixed(2)} per lead`
                : `Spent $${money(Number(c.spend))} · no leads yet`}
            </div>
          )}

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

/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';

interface CampaignCounts {
  pulled: number;
  contacted: number;
  clients: number;
  deals: number;
}

interface CampaignInstagram {
  status: 'none' | 'requested' | 'posted' | 'failed';
  requested_at: string | null;
  post_id: string | null;
  post_url: string | null;
  error: string | null;
}

interface CampaignCreative {
  photo_urls: string[];
  designed_url: string | null;
  approved: boolean;
  instagram: CampaignInstagram;
}

const IG_USERNAME = 'timfennesseyrealestate';
const IG_AVATAR_URL =
  'https://zftihampsyucluajcnmo.supabase.co/storage/v1/object/public/account-assets/a540905b-7cd7-4dd6-bba0-162c07978bd6/team-logo.png';

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
  creative?: CampaignCreative | null;
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

// Ideas are the column Tim acts on (Tim, Nov 3): idea cards carry a
// stronger presence than campaign cards — navy frame, soft shadow.
const ideaCardStyle: React.CSSProperties = {
  ...cardStyle,
  border: '2px solid #0f2a44',
  boxShadow: '0 6px 18px rgba(15, 42, 68, 0.10)',
  padding: '22px',
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
  const [createOpen, setCreateOpen] = useState(false);
  const [ideaBusyId, setIdeaBusyId] = useState('');

  // Per-campaign caption drafts + copy feedback
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState('');
  const [savingId, setSavingId] = useState('');
  const [creativeBusyId, setCreativeBusyId] = useState('');
  const [preview, setPreview] = useState<{
    campaign: LeadCampaign;
    mode: 'view' | 'send';
    slides: string[];
    caption: string;
  } | null>(null);

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
      setCreateOpen(false);
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

  // ---- Layer 3: creative (photos + designed graphic) -----------------

  function getCreative(c: LeadCampaign): CampaignCreative {
    const raw: any = c.creative || {};
    const ig: any =
      raw.instagram && typeof raw.instagram === 'object'
        ? raw.instagram
        : {};
    const igStr = (v: any) => (typeof v === 'string' && v ? v : null);
    return {
      photo_urls: Array.isArray(raw.photo_urls) ? raw.photo_urls : [],
      designed_url:
        typeof raw.designed_url === 'string' ? raw.designed_url : null,
      approved: raw.approved === true,
      instagram: {
        status: ['requested', 'posted', 'failed'].includes(ig.status)
          ? ig.status
          : 'none',
        requested_at: igStr(ig.requested_at),
        post_id: igStr(ig.post_id),
        post_url: igStr(ig.post_url),
        error: igStr(ig.error),
      },
    };
  }

  // The exact slides a send posts, in posting order: the designed
  // graphic first, then the remaining photos (the hero photo itself is
  // already inside the design, so it is not repeated). Cap 10 (IG).
  // The preview modal shows THIS array — it is the contract for what
  // Rea's sweep posts.
  function igSlides(c: LeadCampaign): string[] {
    const cr = getCreative(c);
    if (!cr.designed_url) return [];
    const rest = cr.photo_urls
      .slice(1)
      .filter((u) => u !== cr.designed_url);
    return [cr.designed_url, ...rest].slice(0, 10);
  }

  function openPreview(c: LeadCampaign, mode: 'view' | 'send') {
    setPreview({
      campaign: c,
      mode,
      slides: igSlides(c),
      caption: c.caption || '',
    });
  }

  // The modal's confirm — the ONLY page action that requests a send:
  // approves the creative and flags creative.instagram 'requested'
  // for Rea's sweep. Posting never happens from the page itself.
  async function confirmSend() {
    if (!preview) return;
    const c = preview.campaign;
    setPreview(null);
    await patchCampaign(c.id, {
      creative_approved: true,
      instagram: { status: 'requested' },
    });
  }

  function readiness(c: LeadCampaign): {
    text: string;
    color: string;
    bg: string;
  } {
    const cr = getCreative(c);
    if (!cr.photo_urls.length) {
      return { text: 'Needs photos', color: '#991b1b', bg: '#fef2f2' };
    }
    if (!cr.designed_url) {
      return {
        text: 'Needs the designed graphic',
        color: '#92400e',
        bg: '#fffbeb',
      };
    }
    if (cr.instagram.status === 'posted') {
      return {
        text: 'Posted to Instagram ✓',
        color: '#065f46',
        bg: '#ecfdf5',
      };
    }
    if (!cr.approved) {
      return {
        text: 'Review the creative, then approve',
        color: '#92400e',
        bg: '#fffbeb',
      };
    }
    return { text: '✓ Ready to post', color: '#065f46', bg: '#ecfdf5' };
  }

  async function creativeAction(
    c: LeadCampaign,
    action: string,
    extra?: Record<string, any>
  ) {
    setCreativeBusyId(c.id);
    try {
      const res = await fetch(`/api/lead-campaigns/${c.id}/creative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(extra || {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Creative action failed.');
      await load();
    } catch (err: any) {
      console.error('Creative action failed:', err);
      alert("That didn't work — please try again.");
    } finally {
      setCreativeBusyId('');
    }
  }

  async function uploadPhoto(c: LeadCampaign, file: File) {
    setCreativeBusyId(c.id);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/lead-campaigns/${c.id}/creative`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed.');
      await load();
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      alert("The upload didn't work — please try again.");
    } finally {
      setCreativeBusyId('');
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

  async function deleteCampaign(c: LeadCampaign) {
    if (
      !window.confirm(
        `Delete "${c.name}"?\n\nThis removes the campaign and its photos/graphic. ` +
          'Contacts already captured keep their campaign tag, and the idea stays as-is. ' +
          'This cannot be undone.'
      )
    ) {
      return;
    }
    setSavingId(c.id);
    try {
      const res = await fetch('/api/lead-campaigns', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id }),
      });
      // A 404 means the campaign is already gone (deleted in another
      // tab, or a double-click raced the first delete) — that IS the
      // outcome the user asked for, not a failure. And a success body
      // that fails to parse must not be reported as a failed delete
      // either: only a real error status counts.
      if (res.status !== 404) {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not delete.');
      }
      await load();
    } catch (err: any) {
      console.error('Delete campaign failed:', err);
      alert("Couldn't delete that campaign — please try again.");
    } finally {
      setSavingId('');
    }
  }

  if (loading) {
    return <div style={{ padding: '24px' }}>Loading campaigns…</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1280px' }}>
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

      <style>{`
        .lc-cols { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 24px; align-items: start; }
        .lc-col-campaigns { order: 1; min-width: 0; }
        .lc-col-ideas { order: 2; min-width: 0; }
        @media (max-width: 920px) {
          .lc-cols { grid-template-columns: minmax(0, 1fr); }
          .lc-col-ideas { order: 1; }
          .lc-col-campaigns { order: 2; }
        }
      `}</style>
      <div className="lc-cols">
        <div className="lc-col-campaigns">
      {/* Create — slim collapsed bar by default (Tim, Nov 3: the manual
          form shrinks away so Rea's ideas stay prominent). Expands in
          place to the full form; collapses back via the bar, the
          Collapse control, or automatically after a successful create. */}
      <button
        type="button"
        onClick={() => setCreateOpen((v) => !v)}
        aria-expanded={createOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          boxSizing: 'border-box',
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '14px 20px',
          marginBottom: '20px',
          fontSize: '15px',
          fontWeight: 700,
          color: NAVY,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>+ Create your own campaign</span>
        <span aria-hidden="true" style={{ fontSize: '13px', color: '#6b7280' }}>
          {createOpen ? '▾' : '▸'}
        </span>
      </button>
      {createOpen && (
      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: NAVY,
              margin: 0,
            }}
          >
            New campaign
          </h2>
          <button
            type="button"
            style={plainBtn}
            onClick={() => setCreateOpen(false)}
          >
            Collapse
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            marginBottom: '14px',
          }}
        >
          <div style={{ gridColumn: '1 / -1' }}>
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
            gridTemplateColumns: '1fr 1fr',
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
          <div style={{ gridColumn: '1 / -1' }}>
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
      )}

      {/* Board */}
      <h2
        style={{
          fontSize: '16px',
          fontWeight: 700,
          color: NAVY,
          marginBottom: '12px',
        }}
      >
        Your campaigns
      </h2>
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

          {/* Creative — the final product, reviewed here before posting */}
          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: '14px',
              marginBottom: '14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
              }}
            >
              <span
                style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}
              >
                Creative
              </span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: readiness(c).color,
                  background: readiness(c).bg,
                  borderRadius: '999px',
                  padding: '3px 10px',
                }}
              >
                {readiness(c).text}
              </span>
            </div>

            {getCreative(c).designed_url && (
              <img
                src={getCreative(c).designed_url as string}
                alt="Designed ad graphic for this campaign"
                style={{
                  width: '100%',
                  maxWidth: '360px',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  display: 'block',
                  marginBottom: '10px',
                }}
              />
            )}

            {getCreative(c).photo_urls.length > 0 && (
              <>
                <div
                  style={{
                    display: 'flex',
                    gap: '6px',
                    flexWrap: 'wrap',
                    marginBottom: '6px',
                  }}
                >
                  {getCreative(c).photo_urls.map((u, i) => (
                    <button
                      key={u}
                      title={
                        i === 0
                          ? 'Hero photo — the one in the graphic'
                          : 'Use this photo in the graphic instead'
                      }
                      disabled={creativeBusyId === c.id}
                      onClick={() => {
                        if (i !== 0) {
                          creativeAction(c, 'generate', { hero_url: u });
                        }
                      }}
                      style={{
                        padding: 0,
                        border:
                          i === 0
                            ? `3px solid ${RED}`
                            : '1px solid #d1d5db',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        cursor: i === 0 ? 'default' : 'pointer',
                        background: 'none',
                        lineHeight: 0,
                      }}
                    >
                      <img
                        src={u}
                        alt=""
                        style={{
                          width: '62px',
                          height: '62px',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginBottom: '10px',
                  }}
                >
                  The outlined photo is the hero in the graphic — tap
                  another photo to rebuild the graphic around it.
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                style={plainBtn}
                disabled={creativeBusyId === c.id}
                onClick={() => creativeAction(c, 'fetch_photos')}
              >
                {creativeBusyId === c.id
                  ? 'Working…'
                  : getCreative(c).photo_urls.length
                    ? 'Re-fetch photos'
                    : 'Fetch photos'}
              </button>
              {getCreative(c).photo_urls.length > 0 && (
                <button
                  style={plainBtn}
                  disabled={creativeBusyId === c.id}
                  onClick={() => creativeAction(c, 'generate')}
                >
                  Regenerate graphic
                </button>
              )}
              <label
                style={{ ...plainBtn, display: 'inline-block', cursor: 'pointer' }}
              >
                Upload photo
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files && e.target.files[0];
                    if (f) uploadPhoto(c, f);
                    e.target.value = '';
                  }}
                />
              </label>
              {getCreative(c).designed_url && (
                <button
                  style={
                    getCreative(c).approved
                      ? {
                          ...plainBtn,
                          background: '#ecfdf5',
                          borderColor: '#6ee7b7',
                          color: '#065f46',
                        }
                      : plainBtn
                  }
                  disabled={savingId === c.id}
                  onClick={() =>
                    patchCampaign(c.id, {
                      creative_approved: !getCreative(c).approved,
                    })
                  }
                >
                  {getCreative(c).approved
                    ? '✓ Creative approved'
                    : 'Approve creative'}
                </button>
              )}
              <button
                style={{
                  ...plainBtn,
                  marginLeft: 'auto',
                  borderColor: '#fecaca',
                  color: '#b91c1c',
                  background: '#fff',
                }}
                disabled={savingId === c.id}
                onClick={() => deleteCampaign(c)}
              >
                {savingId === c.id ? 'Working…' : 'Delete campaign'}
              </button>
            </div>

            {/* Layer 4: Instagram send — the page only requests;
                Rea posts and writes the result back. */}
            {getCreative(c).designed_url && (
              <div
                style={{
                  marginTop: '12px',
                  borderTop: '1px dashed #e5e7eb',
                  paddingTop: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <button
                    style={plainBtn}
                    onClick={() => openPreview(c, 'view')}
                  >
                    Preview on Instagram
                  </button>
                  {getCreative(c).instagram.status === 'none' && (
                    <button
                      style={{
                        ...plainBtn,
                        background: RED,
                        borderColor: RED,
                        color: '#fff',
                        fontWeight: 700,
                      }}
                      disabled={savingId === c.id}
                      onClick={() => openPreview(c, 'send')}
                    >
                      {getCreative(c).approved
                        ? 'Send to Instagram'
                        : 'Approve & Send to Instagram'}
                    </button>
                  )}
                  {getCreative(c).instagram.status === 'failed' && (
                    <button
                      style={{
                        ...plainBtn,
                        background: RED,
                        borderColor: RED,
                        color: '#fff',
                        fontWeight: 700,
                      }}
                      disabled={savingId === c.id}
                      onClick={() =>
                        patchCampaign(c.id, {
                          instagram: { status: 'requested' },
                        })
                      }
                    >
                      Try again
                    </button>
                  )}
                </div>
                {getCreative(c).instagram.status === 'requested' && (
                  <div
                    style={{
                      marginTop: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#92400e',
                    }}
                  >
                    Send queued — Rea will post this
                  </div>
                )}
                {getCreative(c).instagram.status === 'posted' && (
                  <div
                    style={{
                      marginTop: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#065f46',
                    }}
                  >
                    Posted to Instagram ✓
                    {getCreative(c).instagram.post_url && (
                      <>
                        {' · '}
                        <a
                          href={
                            getCreative(c).instagram.post_url as string
                          }
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#065f46', textDecoration: 'underline' }}
                        >
                          View post
                        </a>
                      </>
                    )}
                  </div>
                )}
                {getCreative(c).instagram.status === 'failed' && (
                  <div
                    style={{
                      marginTop: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#991b1b',
                    }}
                  >
                    Instagram send failed
                    {getCreative(c).instagram.error
                      ? `: ${getCreative(c).instagram.error}`
                      : ''}
                  </div>
                )}
              </div>
            )}
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
        <div className="lc-col-ideas">
      {/* Ideas from Rea */}
      <h2
        style={{
          fontSize: '19px',
          fontWeight: 800,
          color: NAVY,
          marginBottom: '12px',
        }}
      >
        Ideas from Rea
      </h2>
      {ideas.length === 0 && (
        <div style={{ ...ideaCardStyle, color: '#6b7280', fontSize: '14px' }}>
          No ideas right now — Rea adds new ones as listings, sales and open
          houses happen.
        </div>
      )}
      {ideas.map((idea) => (
        <div key={idea.id} style={ideaCardStyle}>
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
          <div style={{ fontSize: '17px', fontWeight: 800, color: NAVY }}>
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
        </div>
      </div>
      {preview && (
        <IgPreviewModal
          slides={preview.slides}
          caption={preview.caption}
          mode={preview.mode}
          onClose={() => setPreview(null)}
          onConfirm={confirmSend}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instagram preview (Tim, Nov 3, 2026): shows the post exactly as it
// will appear on Instagram before anything is sent — IG chrome,
// carousel with arrows + dots + 1/N counter, the campaign's exact
// caption. This modal is the contract for what Rea's sweep posts: the
// slides and caption passed in are the same ones the send uses. No
// fabricated engagement (no likes line, no invented comments) — just
// the post structure.
// ---------------------------------------------------------------------------

function IgIcon({ d, size = 26 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#111"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function IgPreviewModal({
  slides,
  caption,
  mode,
  onClose,
  onConfirm,
}: {
  slides: string[];
  caption: string;
  mode: 'view' | 'send';
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const n = slides.length;
  const current = Math.min(idx, Math.max(0, n - 1));
  const dateLine = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });

  const arrowBtn: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255,255,255,0.92)',
    boxShadow: '0 1px 6px rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        overflowY: 'auto',
        padding: '24px 12px',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '14px',
          width: '420px',
          maxWidth: '100%',
          overflow: 'hidden',
          fontFamily:
            "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          color: '#111',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* IG header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
          }}
        >
          <img
            src={IG_AVATAR_URL}
            alt=""
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid #e5e7eb',
            }}
          />
          <span style={{ fontWeight: 700, fontSize: '14px' }}>
            {IG_USERNAME}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '3px' }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: '#111',
                  display: 'block',
                }}
              />
            ))}
          </span>
        </div>

        {/* Media — 4:5 portrait frame, carousel */}
        <div
          style={{
            position: 'relative',
            background: '#000',
            aspectRatio: '4 / 5',
            userSelect: 'none',
          }}
        >
          {n > 0 && (
            <img
              src={slides[current]}
              alt={`Slide ${current + 1} of ${n}`}
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          )}
          {n > 1 && (
            <span
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                padding: '2px 9px',
                borderRadius: '999px',
              }}
            >
              {current + 1}/{n}
            </span>
          )}
          {n > 1 && current > 0 && (
            <button
              style={{ ...arrowBtn, left: '10px' }}
              onClick={() => setIdx(current - 1)}
              aria-label="Previous photo"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 5 8 12 15 19" />
              </svg>
            </button>
          )}
          {n > 1 && current < n - 1 && (
            <button
              style={{ ...arrowBtn, right: '10px' }}
              onClick={() => setIdx(current + 1)}
              aria-label="Next photo"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 5 16 12 9 19" />
              </svg>
            </button>
          )}
        </div>

        {/* Position dots */}
        {n > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '5px',
              paddingTop: '8px',
            }}
          >
            {slides.map((s, i) => (
              <span
                key={s + i}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: i === current ? '#0095f6' : '#c7c7c7',
                  display: 'block',
                }}
              />
            ))}
          </div>
        )}

        {/* Action row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '10px 12px 4px',
          }}
        >
          <IgIcon d="M12 20.7C6.2 17 3 13.7 3 10c0-2.7 2-4.9 4.6-4.9 1.7 0 3.3.8 4.4 2.3 1.1-1.5 2.7-2.3 4.4-2.3C19 5.1 21 7.3 21 10c0 3.7-3.2 7-9 10.7z" />
          <IgIcon d="M12 4c5 0 9 3.6 9 8s-4 8-9 8c-1.2 0-2.3-.2-3.3-.6L3 20l.7-3.1C2.6 15.5 3 13.8 3 12c0-4.4 4-8 9-8z" />
          <IgIcon d="M22 2L11 11M22 2l-7 20-4-9-9-4 20-7z" />
          <span style={{ marginLeft: 'auto' }}>
            <IgIcon d="M6 3h12v18l-6-4.2L6 21z" />
          </span>
        </div>

        {/* Caption — the exact text that will post */}
        <div
          style={{
            padding: '2px 12px 0',
            fontSize: '14px',
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <span style={{ fontWeight: 700 }}>{IG_USERNAME}</span>{' '}
          {caption}
        </div>
        <div
          style={{ padding: '6px 12px 0', fontSize: '14px', color: '#737373' }}
        >
          View all comments
        </div>
        <div
          style={{
            padding: '4px 12px 12px',
            fontSize: '12px',
            color: '#737373',
          }}
        >
          {dateLine}
        </div>

        {/* Confirm bar */}
        <div
          style={{
            borderTop: '1px solid #e5e7eb',
            padding: '12px',
            background: '#f8fafc',
          }}
        >
          <div
            style={{ fontSize: '13px', color: '#374151', marginBottom: '10px' }}
          >
            Posting as @{IG_USERNAME} · {n}{' '}
            {n === 1 ? 'image' : 'images'} · caption with tracked link
          </div>
          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
          >
            {mode === 'send' ? (
              <>
                <button style={plainBtn} onClick={onClose}>
                  Cancel
                </button>
                <button
                  style={{
                    ...plainBtn,
                    background: RED,
                    borderColor: RED,
                    color: '#fff',
                    fontWeight: 700,
                  }}
                  onClick={onConfirm}
                >
                  Approve &amp; Send
                </button>
              </>
            ) : (
              <button style={plainBtn} onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

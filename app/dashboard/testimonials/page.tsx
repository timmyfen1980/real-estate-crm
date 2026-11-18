/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';

interface Testimonial {
  id: string;
  author_name: string;
  author_label: string | null;
  rating: number;
  body: string;
  source: string;
  status: string;
  social_url: string | null;
  created_at: string;
}

const NAVY = '#0f2a44';
const RED = '#d22630';
const GREEN = '#1e7d32';

function Stars({ n }: { n: number }) {
  return (
    <span style={{ color: '#e8a317', letterSpacing: 1 }} aria-label={`${n} stars`}>
      {'★'.repeat(n)}
      <span style={{ color: '#d1d5db' }}>{'★'.repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  website: 'Website form',
  google: 'Google',
  remax: 'RE/MAX page',
  manual: 'Added by hand',
};

const LOGO_URL =
  'https://zftihampsyucluajcnmo.supabase.co/storage/v1/object/public/account-assets/team-logo.png';

function defaultCaption(t: Testimonial): string {
  const short = t.body.length > 220 ? `${t.body.slice(0, 217).trim()}…` : t.body;
  return (
    `⭐⭐⭐⭐⭐\n“${short}”\n— ${t.author_name}${t.author_label ? `, ${t.author_label}` : ''}\n\n` +
    'Thank you for trusting our team. Thinking of buying or selling in Durham Region? Let\'s talk — 905 668-3800.\n\n' +
    'More reviews: thefcgroup.ca/testimonials\n\n' +
    '#Whitby #Oshawa #DurhamRegion #RealEstate #FennesseyComeauGroup #ClientReview'
  );
}

// Renders the branded quote card (dark charcoal theme) onto a canvas at
// 1080×1350 and returns a PNG data URL. Drawn in the browser so there is
// nothing to install server-side; the logo is best-effort (if it cannot
// load, the card still renders without it).
async function renderQuoteCard(t: Testimonial): Promise<string> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#16171a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, W, 14);

  // Logo at the top (best effort — drawn first so the layout below is
  // fixed whether or not it loads).
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo'));
      img.src = LOGO_URL;
    });
    const lh = 120;
    const lw = (img.width / img.height) * lh;
    ctx.drawImage(img, (W - lw) / 2, 44, lw, lh);
  } catch {
    // Card is complete without the logo.
  }

  // Stars
  ctx.fillStyle = '#e8a317';
  ctx.font = '64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★'.repeat(Math.max(1, Math.min(5, t.rating))), W / 2, 268);

  // Quote — wrap and shrink to fit.
  const quote = `“${t.body}”`;
  let size = 52;
  let lines: string[] = [];
  const wrap = (fontSize: number): string[] => {
    ctx.font = `600 ${fontSize}px Arial, sans-serif`;
    const words = quote.split(/\s+/);
    const out: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > W - 180 && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
    return out;
  };
  while (size > 26) {
    lines = wrap(size);
    if (lines.length * (size * 1.35) <= 560) break;
    size -= 4;
  }
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  let y = 400;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += size * 1.35;
  }

  // Attribution
  ctx.font = '700 40px Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  const who = t.author_label ? `${t.author_name} — ${t.author_label}` : t.author_name;
  ctx.fillText(who, W / 2, y + 70);

  // Footer (slide footer standard)
  ctx.font = '500 27px Arial, sans-serif';
  ctx.fillStyle = '#c9ced6';
  ctx.fillText('Tim Fennessey, Broker · Aidan Comeau, Sales Representative', W / 2, H - 130);
  ctx.fillText('RE/MAX HALLMARK FIRST GROUP REALTY LTD. · info@thefcgroup.ca · 905 668-3800', W / 2, H - 88);

  return canvas.toDataURL('image/png');
}

export default function TestimonialsPage() {
  const [items, setItems] = useState<Testimonial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Ask form
  const [askName, setAskName] = useState('');
  const [askEmail, setAskEmail] = useState('');
  const [askMsg, setAskMsg] = useState<string | null>(null);

  // Add form
  const [addName, setAddName] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addRating, setAddRating] = useState(5);
  const [addSource, setAddSource] = useState('manual');
  const [addBody, setAddBody] = useState('');

  // Social share panel
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareImg, setShareImg] = useState<string | null>(null);
  const [shareCaption, setShareCaption] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const openShare = async (t: Testimonial) => {
    if (shareId === t.id) {
      setShareId(null);
      setShareImg(null);
      return;
    }
    setShareId(t.id);
    setShareCaption(defaultCaption(t));
    setShareImg(null);
    setCopied(false);
    setShareBusy(true);
    try {
      setShareImg(await renderQuoteCard(t));
    } catch {
      setShareImg(null);
    }
    setShareBusy(false);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/testimonials');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load testimonials.');
      setItems(json.testimonials || []);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (payload: Record<string, any>, key: string) => {
    setBusy(key);
    try {
      const res = await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'That did not save.');
      await load();
    } catch (e: any) {
      alert(e.message);
    }
    setBusy(null);
  };

  const sendAsk = async () => {
    setAskMsg(null);
    setBusy('ask');
    try {
      const res = await fetch('/api/testimonials/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: askName, email: askEmail }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'The email did not send.');
      setAskMsg(`Review request sent to ${askEmail}.`);
      setAskName('');
      setAskEmail('');
    } catch (e: any) {
      setAskMsg(e.message);
    }
    setBusy(null);
  };

  const addManual = async () => {
    await act(
      {
        action: 'create',
        author_name: addName,
        author_label: addLabel,
        rating: addRating,
        source: addSource,
        body: addBody,
      },
      'add'
    );
    setAddName('');
    setAddLabel('');
    setAddBody('');
    setAddRating(5);
  };

  const remove = async (t: Testimonial) => {
    if (!confirm(`Delete the testimonial from ${t.author_name}? This cannot be undone.`)) return;
    await act({ action: 'delete', id: t.id }, `del:${t.id}`);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Testimonials</h1>
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      </div>
    );
  }

  const pending = (items || []).filter((t) => t.status === 'pending');
  const approved = (items || []).filter((t) => t.status === 'approved');
  const hidden = (items || []).filter((t) => t.status === 'hidden');

  const Card = ({ t }: { t: Testimonial }) => (
    <div className="rounded-xl border bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <Stars n={t.rating} />
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          {SOURCE_LABELS[t.source] || t.source}
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{t.body}</p>
      <p className="mt-3 text-sm font-semibold" style={{ color: NAVY }}>
        {t.author_name}
        {t.author_label ? <span className="font-normal text-gray-500"> — {t.author_label}</span> : null}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
        {t.status === 'pending' && (
          <button
            onClick={() => act({ action: 'set_status', id: t.id, status: 'approved' }, `st:${t.id}`)}
            disabled={busy === `st:${t.id}`}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: GREEN }}
          >
            Approve — show on website
          </button>
        )}
        {t.status === 'approved' && (
          <button
            onClick={() => act({ action: 'set_status', id: t.id, status: 'hidden' }, `st:${t.id}`)}
            disabled={busy === `st:${t.id}`}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Hide
          </button>
        )}
        {t.status === 'hidden' && (
          <button
            onClick={() => act({ action: 'set_status', id: t.id, status: 'approved' }, `st:${t.id}`)}
            disabled={busy === `st:${t.id}`}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: GREEN }}
          >
            Show again
          </button>
        )}
        <button
          onClick={() => remove(t)}
          disabled={busy === `del:${t.id}`}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
        {t.status === 'approved' && (
          <button
            onClick={() => openShare(t)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {shareId === t.id ? 'Close share panel' : 'Share to social'}
          </button>
        )}
        {t.social_url && (
          <a
            href={t.social_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-xs font-medium text-gray-500 underline"
          >
            Posted to social
          </a>
        )}
      </div>

      {shareId === t.id && t.status === 'approved' && (
        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Social post — ready to go
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row">
            <div className="w-full max-w-[220px] shrink-0">
              {shareBusy ? (
                <p className="text-sm text-gray-500">Building the graphic…</p>
              ) : shareImg ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shareImg} alt="Testimonial graphic" className="w-full rounded-lg border" />
                  <a
                    href={shareImg}
                    download={`testimonial-${t.author_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`}
                    className="mt-2 block rounded-lg px-3 py-2 text-center text-xs font-semibold text-white"
                    style={{ background: RED }}
                  >
                    Download graphic
                  </a>
                </>
              ) : (
                <p className="text-sm text-red-600">The graphic could not be built in this browser.</p>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <textarea
                value={shareCaption}
                onChange={(e) => setShareCaption(e.target.value)}
                rows={9}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareCaption);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    alert('Copy failed — select the caption text and copy it manually.');
                  }
                }}
                className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
              >
                {copied ? 'Copied ✓' : 'Copy caption'}
              </button>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                Post it on <strong>@fennesseycomeaugroup</strong>: download the graphic, paste the
                caption, and add the Collab invites for @timfennesseyrealestate and
                @aidancomeaurealestate in the Instagram app (invites can only be added in the app).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Testimonials</h1>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        Every client review lives here. Clients leave one review on{' '}
        <a className="underline" href="https://www.thefcgroup.ca/testimonials" target="_blank" rel="noreferrer">
          thefcgroup.ca/testimonials
        </a>{' '}
        — it arrives as <strong>Pending</strong>, and shows on the website once you approve it.
        You can also add reviews by hand (for example, one a client posted on Google) and hide or
        delete any of them at any time.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-base font-bold" style={{ color: NAVY }}>Ask a client for a review</h2>
          <p className="mt-1 text-sm text-gray-600">
            Sends the branded email with one button to the review form.
          </p>
          <input
            value={askName}
            onChange={(e) => setAskName(e.target.value)}
            placeholder="Client name"
            className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={askEmail}
            onChange={(e) => setAskEmail(e.target.value)}
            placeholder="Client email"
            type="email"
            className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
          />
          <button
            onClick={sendAsk}
            disabled={busy === 'ask' || !askName || !askEmail}
            className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: RED }}
          >
            Send the ask email
          </button>
          {askMsg && <p className="mt-2 text-sm text-gray-600">{askMsg}</p>}
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-base font-bold" style={{ color: NAVY }}>Add a testimonial by hand</h2>
          <p className="mt-1 text-sm text-gray-600">
            For a review a client gave you another way — it shows on the website right away.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Name (e.g. J.S.)"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              placeholder="Label (e.g. Buyer, Whitby)"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <select
              value={addRating}
              onChange={(e) => setAddRating(parseInt(e.target.value, 10))}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{n} stars</option>
              ))}
            </select>
            <select
              value={addSource}
              onChange={(e) => setAddSource(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="manual">Given to us directly</option>
              <option value="google">From Google</option>
              <option value="remax">From the RE/MAX page</option>
            </select>
          </div>
          <textarea
            value={addBody}
            onChange={(e) => setAddBody(e.target.value)}
            placeholder="The testimonial, in the client's words…"
            rows={4}
            className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
          />
          <button
            onClick={addManual}
            disabled={busy === 'add' || !addName || !addBody}
            className="mt-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: NAVY }}
          >
            Add testimonial
          </button>
        </div>
      </div>

      {items === null ? (
        <p className="mt-8 text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-bold" style={{ color: NAVY }}>
                Waiting for approval ({pending.length})
              </h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {pending.map((t) => (
                  <Card key={t.id} t={t} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-lg font-bold" style={{ color: NAVY }}>
              Showing on the website ({approved.length})
            </h2>
            {approved.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Nothing showing yet.</p>
            ) : (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {approved.map((t) => (
                  <Card key={t.id} t={t} />
                ))}
              </div>
            )}
          </section>

          {hidden.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-bold" style={{ color: NAVY }}>Hidden ({hidden.length})</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {hidden.map((t) => (
                  <Card key={t.id} t={t} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

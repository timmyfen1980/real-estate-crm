/* eslint-disable @typescript-eslint/no-explicit-any */
// Lead Campaigns, layer 3 — creative: listing photos + a designed ad
// graphic on every campaign, reviewed on the Campaigns page before
// anything is posted (Tim's order, Nov 3, 2026).
//
// creative jsonb on lead_campaigns:
//   { photo_urls: string[], designed_url: string|null, approved: bool,
//     instagram: {...}, slides: string[], error: string|null }
// Campaigns with no listing photos (market snapshots, valuation
// pushes) get a designed 4-slide set instead — see the layer-5
// section at the bottom of this file.
//
// Photo sourcing, best available first:
//   (a) the matched CRM property's stored image (properties.image_url)
//   (b) the public IDX listing page on thefcgroup.ca — its TRREB CDN
//       photo URLs, in page order (needs a browser User-Agent)
//   (c) nothing found → the page offers a manual Upload control, which
//       lands files in account-assets/campaign-creatives/<id>/.
//
// The designed graphic follows Tim's approved listing-graphic standard
// (the 928 Black Cherry set): full-bleed house photo, transparent FC
// logo lockup top-left, a SOFT navy fade rising from the bottom (never
// a heavy block), red eyebrow, big white headline, the price big and
// clean (never a strikethrough, never an old price), address, the
// Tim+Aidan duo cutout bottom-right, and the navy footer bar with the
// red rule — the FOOTER_TEXT standard (both names, info@ email,
// office number 905 668-3800).
// Colours are navy #0f2a44 + red #d22630 ONLY. No separate
// "Fennessey Comeau Group" text — the logo lockup already says it.

import sharp from 'sharp';
import opentype from 'opentype.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Instagram send state (layer 4). The CRM page only ever REQUESTS a
// send; Rea (agent side) posts and writes the result back. Shape:
//   { status: 'none'|'requested'|'posted'|'failed',
//     requested_at, post_id, post_url, error }
export interface CampaignInstagram {
  status: 'none' | 'requested' | 'posted' | 'failed';
  requested_at: string | null;
  post_id: string | null;
  post_url: string | null;
  error: string | null;
}

export const EMPTY_INSTAGRAM: CampaignInstagram = {
  status: 'none',
  requested_at: null,
  post_id: null,
  post_url: null,
  error: null,
};

export function parseInstagram(raw: any): CampaignInstagram {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_INSTAGRAM };
  const str = (v: any) => (typeof v === 'string' && v ? v : null);
  return {
    status: ['requested', 'posted', 'failed'].includes(raw.status)
      ? raw.status
      : 'none',
    requested_at: str(raw.requested_at),
    post_id: str(raw.post_id),
    post_url: str(raw.post_url),
    error: str(raw.error),
  };
}

export interface CampaignCreative {
  photo_urls: string[];
  designed_url: string | null;
  approved: boolean;
  instagram: CampaignInstagram;
  // Layer 5: ordered designed slide set for non-listing campaigns
  // (empty for photo campaigns). slides[0] is also designed_url and
  // slides[1..] are mirrored into photo_urls.
  slides: string[];
  // Layer 5: plain-words reason the last slide generation failed
  // (null when the creative is healthy).
  error: string | null;
}

export const EMPTY_CREATIVE: CampaignCreative = {
  photo_urls: [],
  designed_url: null,
  approved: false,
  instagram: { ...EMPTY_INSTAGRAM },
  slides: [],
  error: null,
};

const STORAGE_BASE =
  'https://zftihampsyucluajcnmo.supabase.co/storage/v1/object/public/account-assets/a540905b-7cd7-4dd6-bba0-162c07978bd6';
export const FC_LOGO_URL = `${STORAGE_BASE}/team-logo.png`;
export const FC_DUO_URL = `${STORAGE_BASE}/brand/tim-aidan-duo.png`;
export const CREATIVE_BUCKET = 'account-assets';
export const MAX_PHOTOS = 8;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export function parseCreative(raw: any): CampaignCreative {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CREATIVE };
  const urls = Array.isArray(raw.photo_urls)
    ? raw.photo_urls.filter(
        (u: any) => typeof u === 'string' && u.trim().length > 0
      )
    : [];
  const slides = Array.isArray(raw.slides)
    ? raw.slides
        .filter((u: any) => typeof u === 'string' && u.trim().length > 0)
        .slice(0, 10)
    : [];
  return {
    photo_urls: urls.slice(0, MAX_PHOTOS),
    designed_url:
      typeof raw.designed_url === 'string' && raw.designed_url
        ? raw.designed_url
        : null,
    approved: raw.approved === true,
    instagram: parseInstagram(raw.instagram),
    slides,
    error:
      typeof raw.error === 'string' && raw.error ? raw.error : null,
  };
}

async function saveCreative(
  supabase: SupabaseClient,
  accountId: string,
  campaignId: string,
  creative: CampaignCreative
): Promise<void> {
  const { error } = await supabase
    .from('lead_campaigns')
    .update({ creative })
    .eq('id', campaignId)
    .eq('account_id', accountId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Subject derivation — what the campaign is about (play / address / price).
// The linked idea (lead_campaign_ideas.built_campaign_id) is the richest
// source; manual campaigns fall back to the name + caption text.
// ---------------------------------------------------------------------------

export interface CreativeSubject {
  play: string;
  address: string | null;
  city: string | null;
  price: string | null;
  mls: string | null;
}

async function loadLinkedIdea(
  supabase: SupabaseClient,
  accountId: string,
  campaignId: string
): Promise<any | null> {
  try {
    const { data } = await supabase
      .from('lead_campaign_ideas')
      .select('play, subject, hook, source_ref')
      .eq('account_id', accountId)
      .eq('built_campaign_id', campaignId)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

function extractPrice(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(/\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{5,})/);
    if (m) {
      const num = m[1].replace(/\.00$/, '');
      return `$${num}`;
    }
  }
  return null;
}

function extractMls(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(/\b([A-Z]\d{7,8})\b/);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

export async function deriveSubject(
  supabase: SupabaseClient,
  campaign: any
): Promise<CreativeSubject> {
  const idea = await loadLinkedIdea(
    supabase,
    campaign.account_id,
    campaign.id
  );

  let subject: string | null =
    (idea && typeof idea.subject === 'string' && idea.subject.trim()) ||
    null;
  if (!subject && typeof campaign.name === 'string') {
    const parts = campaign.name.split('—');
    subject = (parts.length > 1 ? parts.slice(1).join('—') : parts[0]).trim();
  }

  let address: string | null = subject;
  let city: string | null = null;
  if (subject && subject.includes(',')) {
    const idx = subject.lastIndexOf(',');
    address = subject.slice(0, idx).trim();
    city = subject.slice(idx + 1).trim() || null;
  }

  return {
    play: (idea && idea.play) || 'general',
    address,
    city,
    price: extractPrice(
      campaign.caption,
      idea && idea.hook,
      idea && idea.subject,
      campaign.name
    ),
    mls: extractMls(
      idea && idea.source_ref,
      campaign.name,
      campaign.caption
    ),
  };
}

// ---------------------------------------------------------------------------
// Photo sourcing.
// ---------------------------------------------------------------------------

const STREET_SUFFIXES = new Set([
  'street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr',
  'crescent', 'cres', 'boulevard', 'blvd', 'court', 'crt', 'ct',
  'path', 'lane', 'ln', 'way', 'circle', 'cir', 'terrace', 'terr',
  'place', 'pl', 'trail', 'gate', 'row', 'parkway', 'pkwy',
  'heights', 'hts', 'square', 'sq', 'common', 'line',
]);

function streetTokens(address: string | null): {
  number: string | null;
  street: string | null;
} {
  if (!address) return { number: null, street: null };
  const cleaned = address.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ');
  const number = /^\d+$/.test(words[0]) ? words[0] : null;
  // The street NAME is the alphabetic words after the number, minus a
  // trailing suffix word ("Calais" in "8 Calais Street", "Black Cherry"
  // in "928 Black Cherry Drive"). The suffix is NOT the street name —
  // probing on it matches every "… Street" in the table.
  const alpha: string[] = [];
  for (const w of words.slice(number ? 1 : 0)) {
    if (/^[A-Za-z'.-]+$/.test(w)) alpha.push(w.replace(/\./g, ''));
    else break;
  }
  while (
    alpha.length > 1 &&
    STREET_SUFFIXES.has(alpha[alpha.length - 1].toLowerCase())
  ) {
    alpha.pop();
  }
  return { number, street: alpha.length ? alpha.join(' ') : null };
}

function leadingNumber(address: any): string | null {
  const m = String(address || '')
    .trim()
    .match(/^(\d+)\b/);
  return m ? m[1] : null;
}

async function propertyPhoto(
  supabase: SupabaseClient,
  accountId: string,
  address: string | null
): Promise<string | null> {
  const { number, street } = streetTokens(address);
  if (!street) return null;
  try {
    const { data } = await supabase
      .from('properties')
      .select('address, image_url')
      .eq('account_id', accountId)
      .ilike('address', `%${street}%`)
      .limit(25);
    const rows = (data || []).filter((r: any) => r.image_url);
    if (!rows.length) return null;
    const scored = rows
      .map((r: any) => {
        let score = 0;
        const a = String(r.address || '').toLowerCase();
        if (street && a.includes(street.toLowerCase())) score += 2;
        const lead = leadingNumber(r.address);
        if (number && lead === number) score += 4;
        if (number && lead && lead !== number) score -= 4;
        return { r, score, lead };
      })
      .sort((x: any, y: any) => y.score - x.score);
    const best = scored[0];
    // Never show the WRONG house: when the subject carries a street
    // number, only a property with that same leading number qualifies;
    // otherwise return nothing and let the IDX photos carry the card.
    if (number && best.lead !== number) return null;
    if (best.score <= 0) return null;
    return best.r.image_url || null;
  } catch {
    return null;
  }
}

async function idxPhotos(mls: string | null): Promise<string[]> {
  if (!mls) return [];
  try {
    const res = await fetch(`https://www.thefcgroup.ca/listings/${mls}`, {
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (!res.ok) return [];
    const html = (await res.text()).replace(/\\\//g, '/');
    const out: string[] = [];
    const seen = new Set<string>();
    const re = /https:\/\/trreb-image\.ampre\.ca\/[^"'\s]+?\.jpg/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const url = m[0];
      const keyMatch = url.match(/\/p\/([0-9a-f-]{36})/);
      const key = keyMatch ? keyMatch[1] : url;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(url);
      if (out.length >= MAX_PHOTOS) break;
    }
    return out;
  } catch {
    return [];
  }
}

// Fetch (or re-fetch) the campaign's photos and save them. Manually
// uploaded photos (stored under campaign-creatives/) are preserved.
export async function fetchCampaignPhotos(
  supabase: SupabaseClient,
  campaign: any
): Promise<CampaignCreative> {
  const creative = parseCreative(campaign.creative);
  const subject = await deriveSubject(supabase, campaign);

  const [propUrl, idx] = await Promise.all([
    propertyPhoto(supabase, campaign.account_id, subject.address),
    idxPhotos(subject.mls),
  ]);

  const uploads = creative.photo_urls.filter((u) =>
    u.includes('/campaign-creatives/')
  );
  const merged: string[] = [];
  for (const u of [propUrl, ...idx, ...uploads]) {
    if (u && !merged.includes(u)) merged.push(u);
    if (merged.length >= MAX_PHOTOS) break;
  }

  const heroChanged = merged[0] !== creative.photo_urls[0];
  const next: CampaignCreative = {
    ...creative,
    photo_urls: merged,
    // If the hero changed, the old graphic no longer matches it: drop
    // the design and the approval so the card asks for a fresh review
    // (and any Instagram state belonged to the old design — reset it).
    approved: heroChanged ? false : creative.approved,
    designed_url: heroChanged ? null : creative.designed_url,
    instagram: heroChanged ? { ...EMPTY_INSTAGRAM } : creative.instagram,
  };
  await saveCreative(supabase, campaign.account_id, campaign.id, next);
  return next;
}

// ---------------------------------------------------------------------------
// The designed graphic.
// ---------------------------------------------------------------------------

const W = 1080;
const H = 1350;
const NAVY = '#0f2a44';
const RED = '#d22630';
const FOOTER_TOP = 1272;

// Footer standard (Tim, 2026-11-11): BOTH names with their RECO
// titles, the info@ email, and the OFFICE number 905 668-3800 —
// mass materials never carry Tim's direct line. The line is longer
// than the old Tim-only footer, so footer sizes auto-fit the width.
const FOOTER_TEXT =
  'Tim Fennessey, Broker · Aidan Comeau, Sales Representative · info@thefcgroup.ca · 905 668-3800';

function fitFooterSize(
  fonts: GraphicFonts | null,
  text: string,
  start: number,
  ls = 0.5
): number {
  let size = start;
  if (fonts) {
    while (size > 12 && measureText(fonts.f600, text, size, ls) > W - 48)
      size -= 1;
  } else {
    size = Math.max(
      12,
      Math.min(start, Math.floor((W - 48) / (text.length * 0.54)))
    );
  }
  return size;
}

const PLAY_DESIGN: Record<
  string,
  { eyebrow: string; lines: string[]; size: number }
> = {
  new_listing: { eyebrow: 'NEW LISTING', lines: ['JUST LISTED'], size: 112 },
  improved_price: {
    eyebrow: 'RELISTED',
    lines: ['IMPROVED', 'PRICE'],
    size: 86,
  },
  sold: { eyebrow: 'JUST SOLD', lines: ['SOLD'], size: 140 },
  open_house: {
    eyebrow: 'THIS WEEKEND',
    lines: ['OPEN', 'HOUSE'],
    size: 100,
  },
  seller_push: {
    eyebrow: 'HOMEOWNERS',
    lines: ["WHAT'S YOUR", 'HOME WORTH?'],
    size: 80,
  },
  buyer_qualify: {
    eyebrow: 'FIRST-TIME BUYERS',
    lines: ['WHAT CAN YOU', 'QUALIFY FOR?'],
    size: 76,
  },
  expired_area: {
    eyebrow: 'HOMEOWNERS',
    lines: ['HOMES ARE', 'STILL MOVING'],
    size: 84,
  },
  market_update: {
    eyebrow: 'MARKET UPDATE',
    lines: ['MARKET', 'UPDATE'],
    size: 98,
  },
  giveaway: { eyebrow: 'GIVEAWAY', lines: ['GIVEAWAY'], size: 106 },
  winner_clone: {
    eyebrow: 'BACK BY DEMAND',
    lines: ['BACK BY', 'DEMAND'],
    size: 98,
  },
  general: { eyebrow: '', lines: ['JUST LISTED'], size: 112 },
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Graphic fonts. Vercel's runtime ships NO system fonts, and librsvg
// ignores @font-face data URIs — so SVG <text> renders as empty boxes
// in production (seen live on the first 8 Calais graphic, Nov 3, 2026).
// Instead the overlay text is drawn as vector paths: Montserrat
// (600/700/800) is fetched once from Google Fonts (an old User-Agent
// gets static TTFs), parsed with opentype.js, and every string is
// converted to glyph outlines — identical output on any runtime. If
// the fonts can't be loaded, the overlay falls back to SVG <text>
// (correct wherever a system font exists).
// ---------------------------------------------------------------------------

interface GraphicFonts {
  f600: any;
  f700: any;
  f800: any;
}

let fontsPromise: Promise<GraphicFonts | null> | null = null;

function loadGraphicFonts(): Promise<GraphicFonts | null> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      try {
        const cssRes = await fetch(
          'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&display=swap',
          { headers: { 'User-Agent': 'Mozilla/4.0' } }
        );
        if (!cssRes.ok) return null;
        const css = await cssRes.text();
        const urls = new Map<string, string>();
        for (const block of css.split('@font-face')) {
          const w = block.match(/font-weight:\s*(\d+)/);
          const u = block.match(/url\((https:[^)]+\.ttf)\)/);
          if (w && u) urls.set(w[1], u[1]);
        }
        const load = async (weight: string) => {
          const url = urls.get(weight);
          if (!url) return null;
          const buf = await fetchBuffer(url);
          return opentype.parse(
            buf.buffer.slice(
              buf.byteOffset,
              buf.byteOffset + buf.byteLength
            ) as ArrayBuffer
          );
        };
        const [f600, f700, f800] = await Promise.all([
          load('600'),
          load('700'),
          load('800'),
        ]);
        if (!f600 || !f700 || !f800) return null;
        return { f600, f700, f800 };
      } catch {
        return null;
      }
    })();
  }
  return fontsPromise;
}

function glyphRun(font: any, str: string): any[] {
  return Array.from(str).map((ch) => font.charToGlyph(ch));
}

function measureText(font: any, str: string, size: number, ls = 0): number {
  const scale = size / font.unitsPerEm;
  const gs = glyphRun(font, str);
  let w = 0;
  gs.forEach((g: any, i: number) => {
    w += g.advanceWidth * scale;
    if (i < gs.length - 1) {
      w += font.getKerningValue(g, gs[i + 1]) * scale + ls;
    }
  });
  return w;
}

function textToPath(
  font: any,
  str: string,
  x: number,
  y: number,
  size: number,
  ls = 0
): string {
  const scale = size / font.unitsPerEm;
  const gs = glyphRun(font, str);
  let cx = x;
  let d = '';
  gs.forEach((g: any, i: number) => {
    // Round each glyph's origin to the same 2dp grid the path data
    // is printed on. The raw accumulation (cx += advance * scale)
    // drifts a hair off clean values (80.60000000000001 in place of
    // 80.6), and opentype's decimal rounding turns that dust into
    // NaN coordinates for glyph points that land on integers — SVG
    // renderers then drop those segments and letters lose chunks
    // (proven locally 2026-11-03: the 'O' in NOVEMBER rendered as a
    // sliver under librsvg, cairo and resvg alike, and the same
    // string with a clean origin rendered whole in all three).
    d += g
      .getPath(Math.round(cx * 100) / 100, Math.round(y * 100) / 100, size)
      .toPathData(2);
    cx += g.advanceWidth * scale;
    if (i < gs.length - 1) {
      cx += font.getKerningValue(g, gs[i + 1]) * scale + ls;
    }
  });
  return d;
}

function overlaySvg(
  subject: CreativeSubject,
  fonts: GraphicFonts | null
): Buffer {
  const cfg = PLAY_DESIGN[subject.play] || PLAY_DESIGN.general;
  const eyebrowText = [cfg.eyebrow, subject.city ? subject.city.toUpperCase() : '']
    .filter(Boolean)
    .join(' · ');
  const addressText = [subject.address, subject.city]
    .filter(Boolean)
    .join(', ');
  const addressBase = 1196;
  const priceBase = 1114;
  const headLastBase = subject.price ? 958 : 1052;
  const lh = Math.round(cfg.size * 1.05);
  const firstBase = headLastBase - (cfg.lines.length - 1) * lh;
  const eyebrowBase = firstBase - cfg.size - 34;
  const footerText = FOOTER_TEXT;
  const footerSize = fitFooterSize(fonts, footerText, 27);
  const strokeAttrs =
    'style="paint-order:stroke" stroke="rgba(8,17,30,0.35)" stroke-width="5"';

  let texts = '';
  let footer = '';
  if (fonts) {
    if (eyebrowText) {
      texts += `<path d="${textToPath(fonts.f800, eyebrowText, 58, eyebrowBase, 30, 6)}" fill="${RED}"/>`;
    }
    cfg.lines.forEach((ln, i) => {
      texts += `<path d="${textToPath(fonts.f800, ln, 54, firstBase + i * lh, cfg.size)}" fill="#ffffff" ${strokeAttrs}/>`;
    });
    if (subject.price) {
      texts += `<path d="${textToPath(fonts.f800, subject.price, 54, priceBase, 118)}" fill="#ffffff" ${strokeAttrs}/>`;
    }
    if (addressText) {
      texts += `<path d="${textToPath(fonts.f700, addressText, 56, addressBase, 44)}" fill="#ffffff"/>`;
    }
    const fw = measureText(fonts.f600, footerText, footerSize, 0.5);
    footer = `<path d="${textToPath(fonts.f600, footerText, (W - fw) / 2, FOOTER_TOP + 51, footerSize, 0.5)}" fill="#ffffff"/>`;
  } else {
    if (eyebrowText) {
      texts += `<text x="58" y="${eyebrowBase}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" letter-spacing="6" fill="${RED}">${esc(eyebrowText)}</text>`;
    }
    cfg.lines.forEach((ln, i) => {
      texts += `<text x="54" y="${firstBase + i * lh}" font-family="Arial, Helvetica, sans-serif" font-size="${cfg.size}" font-weight="800" fill="#ffffff" style="paint-order:stroke" stroke="rgba(8,17,30,0.35)" stroke-width="5">${esc(ln)}</text>`;
    });
    if (subject.price) {
      texts += `<text x="54" y="${priceBase}" font-family="Arial, Helvetica, sans-serif" font-size="118" font-weight="800" fill="#ffffff" style="paint-order:stroke" stroke="rgba(8,17,30,0.35)" stroke-width="5">${esc(subject.price)}</text>`;
    }
    if (addressText) {
      texts += `<text x="56" y="${addressBase}" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" fill="#ffffff">${esc(addressText)}</text>`;
    }
    footer = `<text x="${W / 2}" y="${FOOTER_TOP + 51}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${footerSize}" font-weight="600" letter-spacing="0.5" fill="#ffffff">${esc(footerText)}</text>`;
  }

  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.34" stop-color="${NAVY}" stop-opacity="0"/>
      <stop offset="0.56" stop-color="${NAVY}" stop-opacity="0.45"/>
      <stop offset="0.78" stop-color="${NAVY}" stop-opacity="0.88"/>
      <stop offset="0.94" stop-color="${NAVY}" stop-opacity="0.97"/>
      <stop offset="1" stop-color="${NAVY}" stop-opacity="0.97"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  <rect x="0" y="${FOOTER_TOP - 4}" width="${W}" height="4" fill="${RED}"/>
  <rect x="0" y="${FOOTER_TOP}" width="${W}" height="${H - FOOTER_TOP}" fill="${NAVY}"/>
  ${footer}
  ${texts}
</svg>`
  );
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for image.`);
  return Buffer.from(await res.arrayBuffer());
}

// Compose the 1080×1350 designed graphic and return the PNG buffer.
export async function composeCampaignGraphic(
  heroUrl: string,
  subject: CreativeSubject
): Promise<Buffer> {
  const heroBuf = await fetchBuffer(heroUrl);
  const hero = await sharp(heroBuf)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const fonts = await loadGraphicFonts();
  const composites: sharp.OverlayOptions[] = [
    { input: overlaySvg(subject, fonts), top: 0, left: 0 },
  ];

  // Duo cutout, bottom-right, with a soft fade at its bottom edge.
  // Optional garnish — if it can't be fetched, ship without it.
  try {
    const duoW = 430;
    const duoBase = await sharp(await fetchBuffer(FC_DUO_URL))
      .resize({ width: duoW })
      .png()
      .toBuffer();
    const duoMeta = await sharp(duoBase).metadata();
    const duoH = duoMeta.height || 242;
    const fadeSvg = Buffer.from(
      `<svg width="${duoW}" height="${duoH}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="df" x1="0" y1="0" x2="0" y2="1"><stop offset="0.70" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="${duoW}" height="${duoH}" fill="url(#df)"/></svg>`
    );
    const duo = await sharp(duoBase)
      .composite([{ input: fadeSvg, blend: 'dest-in' }])
      .png()
      .toBuffer();
    composites.push({
      input: duo,
      top: FOOTER_TOP - 4 - duoH,
      left: W - duoW - 24,
    });
  } catch {
    // duo is optional
  }

  // FC logo lockup (transparent), top-left.
  try {
    const logo = await sharp(await fetchBuffer(FC_LOGO_URL))
      .trim()
      .resize({ width: 290 })
      .png()
      .toBuffer();
    composites.push({ input: logo, top: 24, left: 34 });
  } catch {
    // logo fetch failing should not kill the graphic
  }

  return sharp(hero).composite(composites).png().toBuffer();
}

// Generate (or regenerate) the designed graphic for a campaign. When
// heroUrl is given and belongs to the campaign's photos it becomes the
// new hero (moved to the front). Regeneration always clears approval —
// a changed creative must be reviewed again.
export async function generateCampaignGraphic(
  supabase: SupabaseClient,
  campaign: any,
  heroUrl?: string | null
): Promise<CampaignCreative> {
  const creative = parseCreative(campaign.creative);
  if (!creative.photo_urls.length) {
    throw new Error('No photos yet — fetch or upload photos first.');
  }
  let photos = creative.photo_urls;
  if (heroUrl && photos.includes(heroUrl) && photos[0] !== heroUrl) {
    photos = [heroUrl, ...photos.filter((u) => u !== heroUrl)];
  }
  const subject = await deriveSubject(supabase, campaign);
  const png = await composeCampaignGraphic(photos[0], subject);

  const path = `campaign-creatives/${campaign.id}/designed.png`;
  const { error: upError } = await supabase.storage
    .from(CREATIVE_BUCKET)
    .upload(path, png, { contentType: 'image/png', upsert: true });
  if (upError) throw upError;
  const { data: pub } = supabase.storage
    .from(CREATIVE_BUCKET)
    .getPublicUrl(path);

  const next: CampaignCreative = {
    photo_urls: photos,
    designed_url: `${pub.publicUrl}?v=${Date.now()}`,
    approved: false,
    slides: [],
    error: null,
    // A regenerated graphic is a NEW creative: any earlier send state
    // belongs to the old image, so reset it — the new one must be
    // reviewed and requested again.
    instagram: { ...EMPTY_INSTAGRAM },
  };
  await saveCreative(supabase, campaign.account_id, campaign.id, next);
  return next;
}

// Record an uploaded photo URL on the campaign (used after the route
// stores the file in the campaign's storage folder).
export async function addUploadedPhoto(
  supabase: SupabaseClient,
  campaign: any,
  url: string
): Promise<CampaignCreative> {
  const creative = parseCreative(campaign.creative);
  if (creative.photo_urls.includes(url)) return creative;
  if (creative.photo_urls.length >= MAX_PHOTOS) {
    throw new Error(`Photo limit reached (${MAX_PHOTOS}).`);
  }
  const next: CampaignCreative = {
    ...creative,
    photo_urls: [...creative.photo_urls, url],
  };
  await saveCreative(supabase, campaign.account_id, campaign.id, next);
  return next;
}

// ---------------------------------------------------------------------------
// Non-listing slide sets (layer 5). When photo sourcing finds NOTHING —
// the campaign is not about one house (a market snapshot, a valuation
// push, a downsizing play) — there are no photos to fetch, and the card
// must not sit at "Needs photos" (Tim's rule, Nov 3, 2026: building a
// campaign means it arrives finished). Instead the campaign gets a
// designed 4-slide set, built from real brand assets only:
//   S1 LEAD      — the campaign headline as the hook (also designed_url)
//   S2 SUBSTANCE — real market stats for market plays (a stat prints
//                  ONLY when based on ≥5 records — never invented), or
//                  "3 things that move your number" for seller plays
//   S3 EXPLAINER — what it means / how it works / first-look pitch
//   S4 TEAM      — team photo, logo, capture pitch, RECO footer
// The slides are stored in creative.slides (ordered); slides 2–4 also
// sit in photo_urls so the existing carousel contract keeps working,
// with S1 as designed_url.
// ---------------------------------------------------------------------------

export const TEAM_PHOTO_URL = `${STORAGE_BASE}/brand/email-hero.jpg`;

function plainSlideError(err: any): string {
  const m = String((err && err.message) || '');
  if (
    !m ||
    /invalid input syntax|duplicate key|violates|does not exist|permission denied|PGRST|JWT|fetch failed|network|socket|ECONN|ETIMEDOUT|ENOTFOUND/i.test(
      m
    )
  ) {
    return 'The slide maker hit a snag — please try again.';
  }
  return m.length > 160 ? `${m.slice(0, 157)}…` : m;
}

// Which playbook a slides campaign follows. The linked idea's play is
// the richest source (deriveSubject already resolves it); manual
// campaigns infer from goal + capture page:
//   buyers goal            → buyer variant of the market play
//   valuation capture      → seller_push ("what's it worth" mechanics)
//   sellers goal           → seller_push
//   watch capture / other  → market_update
function resolveSlidePlay(campaign: any, subject: CreativeSubject): string {
  if (subject.play && subject.play !== 'general') return subject.play;
  if (campaign.goal === 'buyers') return 'buyer_market';
  if (campaign.capture_type === 'valuation') return 'seller_push';
  if (campaign.goal === 'sellers') return 'seller_push';
  return 'market_update';
}

// --- Market stats, from the CRM's own tables -----------------------------
// Column names are detected at runtime from the returned rows (the
// first candidate that actually carries numbers wins) and every query
// is fail-soft: a stat that can't be computed simply doesn't print.

export interface MarketStatLine {
  label: string;
  value: string;
  n: number;
}

const PRICE_KEYS = ['selling_price', 'sale_price', 'sold_price', 'price', 'amount'];
const DATE_KEYS = [
  'close_date',
  'closing_date',
  'sold_date',
  'firm_date',
  'updated_at',
  'created_at',
];
const DOM_KEYS = ['days_on_market', 'dom'];

function numericField(rows: any[], keys: string[]): string | null {
  for (const k of keys) {
    if (
      rows.some((r) => {
        const v = Number(r && r[k]);
        return Number.isFinite(v) && v > 0;
      })
    ) {
      return k;
    }
  }
  return null;
}

export async function loadMarketStats(
  supabase: SupabaseClient,
  accountId: string
): Promise<MarketStatLine[]> {
  const lines: MarketStatLine[] = [];

  // Median sold price, last 90 days (Sold Firm + Closed deals).
  try {
    const { data } = await supabase
      .from('deals')
      .select('*')
      .eq('account_id', accountId)
      .in('status', ['Sold Firm', 'Closed'])
      .limit(500);
    const rows = data || [];
    const priceKey = numericField(rows, PRICE_KEYS);
    if (priceKey) {
      const dateKey = DATE_KEYS.find((k) =>
        rows.some((r) => r && r[k] && !Number.isNaN(Date.parse(r[k])))
      );
      const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
      const prices = rows
        .filter((r: any) => {
          if (!dateKey) return true;
          const t = Date.parse(r[dateKey]);
          return Number.isNaN(t) || t >= cutoff;
        })
        .map((r: any) => Number(r[priceKey]))
        .filter((v: number) => Number.isFinite(v) && v > 0)
        .sort((a: number, b: number) => a - b);
      if (prices.length >= 5) {
        const mid = Math.floor(prices.length / 2);
        const median =
          prices.length % 2
            ? prices[mid]
            : (prices[mid - 1] + prices[mid]) / 2;
        lines.push({
          label: 'MEDIAN SOLD PRICE · LAST 90 DAYS',
          value: `$${Math.round(median).toLocaleString('en-US')}`,
          n: prices.length,
        });
      }
    }
  } catch {
    // stat simply doesn't print
  }

  // Average days on market (properties carrying a DOM figure).
  try {
    const { data } = await supabase
      .from('properties')
      .select('*')
      .eq('account_id', accountId)
      .limit(500);
    const rows = data || [];
    const domKey = DOM_KEYS.find((k) =>
      rows.some((r) => {
        const v = Number(r && r[k]);
        return Number.isFinite(v) && v >= 0 && r[k] !== null && r[k] !== '';
      })
    );
    if (domKey) {
      const vals = rows
        .map((r: any) => Number(r[domKey]))
        .filter((v: number) => Number.isFinite(v) && v >= 0);
      if (vals.length >= 5) {
        const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
        lines.push({
          label: 'AVERAGE DAYS ON MARKET',
          value: `${Math.round(avg)} days`,
          n: vals.length,
        });
      }
    }
  } catch {
    // stat simply doesn't print
  }

  // Homes for sale right now (exact count of for_sale properties).
  try {
    const { count } = await supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'for_sale');
    if (typeof count === 'number' && count >= 5) {
      lines.push({
        label: 'HOMES FOR SALE RIGHT NOW',
        value: String(count),
        n: count,
      });
    }
  } catch {
    // stat simply doesn't print
  }

  return lines;
}

// --- Slide text helpers ---------------------------------------------------

function slideText(
  fonts: GraphicFonts | null,
  weight: 'f600' | 'f700' | 'f800',
  str: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  ls = 0,
  anchor: 'start' | 'middle' = 'start',
  stroke = false
): string {
  const strokeAttrs = stroke
    ? ' style="paint-order:stroke" stroke="rgba(8,17,30,0.35)" stroke-width="5"'
    : '';
  if (fonts) {
    let sx = x;
    if (anchor === 'middle') {
      sx = x - measureText(fonts[weight], str, size, ls) / 2;
    }
    return `<path d="${textToPath(fonts[weight], str, sx, y, size, ls)}" fill="${fill}"${stroke ? ' style="paint-order:stroke" stroke="rgba(8,17,30,0.35)" stroke-width="5"' : ''}/>`;
  }
  return `<text x="${x}" y="${y}"${anchor === 'middle' ? ' text-anchor="middle"' : ''} font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight === 'f600' ? 600 : weight === 'f700' ? 700 : 800}"${ls ? ` letter-spacing="${ls}"` : ''} fill="${fill}"${strokeAttrs}>${esc(str)}</text>`;
}

function wrapText(
  fonts: GraphicFonts | null,
  weight: 'f600' | 'f700' | 'f800',
  str: string,
  size: number,
  maxW: number,
  ls = 0
): string[] {
  const width = (s: string) =>
    fonts ? measureText(fonts[weight], s, size, ls) : s.length * size * 0.56;
  const words = str.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (width(t) <= maxW || !cur) {
      cur = t;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fitSize(
  fonts: GraphicFonts | null,
  weight: 'f600' | 'f700' | 'f800',
  lines: string[],
  sizes: number[],
  maxW: number,
  ls = 0
): number {
  for (const s of sizes) {
    const ok = lines.every(
      (ln) =>
        (fonts
          ? measureText(fonts[weight], ln, s, ls)
          : ln.length * s * 0.56) <= maxW
    );
    if (ok) return s;
  }
  return sizes[sizes.length - 1];
}

function slideFooter(
  fonts: GraphicFonts | null,
  text = FOOTER_TEXT
): string {
  const size = fitFooterSize(fonts, text, 27);
  return (
    `<rect x="0" y="${FOOTER_TOP - 4}" width="${W}" height="4" fill="${RED}"/>` +
    `<rect x="0" y="${FOOTER_TOP}" width="${W}" height="${H - FOOTER_TOP}" fill="${NAVY}"/>` +
    slideText(fonts, 'f600', text, W / 2, FOOTER_TOP + 51, size, '#ffffff', 0.5, 'middle')
  );
}

// Logo (top-left) + duo (bottom-right) overlays, shared with the
// listing graphic. Each is independently fail-soft garnish.
async function brandOverlays(): Promise<sharp.OverlayOptions[]> {
  const out: sharp.OverlayOptions[] = [];
  try {
    const duoW = 430;
    const duoBase = await sharp(await fetchBuffer(FC_DUO_URL))
      .resize({ width: duoW })
      .png()
      .toBuffer();
    const duoMeta = await sharp(duoBase).metadata();
    const duoH = duoMeta.height || 242;
    const fadeSvg = Buffer.from(
      `<svg width="${duoW}" height="${duoH}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="df" x1="0" y1="0" x2="0" y2="1"><stop offset="0.70" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="${duoW}" height="${duoH}" fill="url(#df)"/></svg>`
    );
    const duo = await sharp(duoBase)
      .composite([{ input: fadeSvg, blend: 'dest-in' }])
      .png()
      .toBuffer();
    out.push({
      input: duo,
      top: FOOTER_TOP - 4 - duoH,
      left: W - duoW - 24,
    });
  } catch {
    // duo is optional
  }
  try {
    const logo = await sharp(await fetchBuffer(FC_LOGO_URL))
      .trim()
      .resize({ width: 290 })
      .png()
      .toBuffer();
    out.push({ input: logo, top: 24, left: 34 });
  } catch {
    // logo is optional garnish too
  }
  return out;
}

async function navyBase(): Promise<Buffer> {
  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 15, g: 42, b: 68, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

// --- The four slides --------------------------------------------------------

async function composeLeadSlide(
  campaign: any,
  subject: CreativeSubject,
  idea: any | null,
  play: string,
  fonts: GraphicFonts | null
): Promise<Buffer> {
  const cfg = PLAY_DESIGN[play] || PLAY_DESIGN.market_update;
  const nameParts = String(campaign.name || '')
    .split('—')
    .map((s: string) => s.trim())
    .filter(Boolean);
  const titleRaw = (nameParts[0] || 'Market Update').toUpperCase();
  const subline =
    (idea && typeof idea.subject === 'string' && idea.subject.trim()) ||
    nameParts[1] ||
    subject.address ||
    '';
  const eyebrowText = [
    cfg.eyebrow,
    subline ? subline.toUpperCase() : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const titleLines = wrapText(fonts, 'f800', titleRaw, 96, W - 116);
  const size = fitSize(fonts, 'f800', titleLines, [100, 92, 84, 76, 68], W - 116);
  const wrapped = wrapText(fonts, 'f800', titleRaw, size, W - 116);
  const lh = Math.round(size * 1.06);
  const eyebrowBase = 430;
  const firstBase = eyebrowBase + size + 44;
  const subBase = firstBase + (wrapped.length - 1) * lh + 92;

  let texts = '';
  if (eyebrowText) {
    texts += slideText(fonts, 'f800', eyebrowText, 58, eyebrowBase, 30, RED, 6);
  }
  wrapped.forEach((ln, i) => {
    texts += slideText(fonts, 'f800', ln, 54, firstBase + i * lh, size, '#ffffff', 0, 'start', true);
  });
  if (subline) {
    texts += slideText(fonts, 'f700', subline, 56, subBase, 44, '#ffffff');
  }

  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY}" stop-opacity="1"/>
      <stop offset="1" stop-color="#0a1e33" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sbg)"/>
  ${slideFooter(fonts)}
  ${texts}
</svg>`
  );
  const base = await navyBase();
  return sharp(base)
    .composite([{ input: svg, top: 0, left: 0 }, ...(await brandOverlays())])
    .png()
    .toBuffer();
}

const SELLER_POINTS = [
  'What sold nearby — real prices, not guesses',
  'Condition and updates buyers will pay for',
  'Timing — how many homes you are up against',
];

const HONEST_POINTS = [
  'Need a home this year? Waiting for a perfect rate rarely pays.',
  'Able to wait? More listings mean more choice.',
  'Either way — watch the homes, not the headlines.',
];

const BUYER_QUALIFY_POINTS = [
  'Your income sets the mortgage — the stress test decides how much',
  'Your down payment sits on top — see 5%, 10% and 20% side by side',
  'Debts shrink the number — a car payment counts against you',
];

async function composeSubstanceSlide(
  play: string,
  region: string,
  stats: MarketStatLine[],
  fonts: GraphicFonts | null
): Promise<Buffer> {
  let body = '';
  if (
    (play === 'market_update' || play === 'buyer_market' || play === 'buyer_qualify') &&
    stats.length >= 2
  ) {
    const eyebrow = `${(region || 'Your area').toUpperCase()} RIGHT NOW`;
    body += slideText(fonts, 'f800', eyebrow, 58, 300, 32, RED, 6);
    let y = 452;
    stats.slice(0, 3).forEach((s, i) => {
      if (i > 0) {
        body += `<rect x="58" y="${y - 108}" width="${W - 116}" height="2" fill="rgba(255,255,255,0.18)"/>`;
      }
      body += slideText(fonts, 'f800', s.value, 56, y, 92, '#ffffff');
      body += slideText(fonts, 'f600', s.label, 58, y + 52, 27, '#c9d6e4', 2);
      y += 238;
    });
  } else if (play === 'buyer_market') {
    body += slideText(fonts, 'f800', 'THE HONEST ANSWER', 56, 330, 62, '#ffffff', 0, 'start', true);
    let y = 470;
    for (const p of HONEST_POINTS) {
      const lines = wrapText(fonts, 'f700', p, 40, W - 190);
      body += slideText(fonts, 'f800', '—', 58, y, 40, RED);
      lines.forEach((ln, i) => {
        body += slideText(fonts, 'f700', ln, 108, y + i * 56, 40, '#ffffff');
      });
      y += lines.length * 56 + 44;
    }
  } else if (play === 'buyer_qualify') {
    body += slideText(fonts, 'f800', 'HOW THE NUMBER WORKS', 56, 330, 62, '#ffffff', 0, 'start', true);
    let y = 470;
    for (const p of BUYER_QUALIFY_POINTS) {
      const lines = wrapText(fonts, 'f700', p, 40, W - 190);
      body += slideText(fonts, 'f800', '—', 58, y, 40, RED);
      lines.forEach((ln, i) => {
        body += slideText(fonts, 'f700', ln, 108, y + i * 56, 40, '#ffffff');
      });
      y += lines.length * 56 + 44;
    }
  } else {
    const titleLines = wrapText(fonts, 'f800', '3 THINGS THAT MOVE YOUR NUMBER', 66, W - 116);
    titleLines.forEach((ln, i) => {
      body += slideText(fonts, 'f800', ln, 56, 322 + i * 72, 66, '#ffffff', 0, 'start', true);
    });
    let y = 322 + titleLines.length * 72 + 92;
    SELLER_POINTS.forEach((p, idx) => {
      const lines = wrapText(fonts, 'f700', p, 40, W - 210);
      body += slideText(fonts, 'f800', `${idx + 1}`, 58, y, 54, RED);
      lines.forEach((ln, i) => {
        body += slideText(fonts, 'f700', ln, 128, y + i * 56, 40, '#ffffff');
      });
      y += lines.length * 56 + 52;
    });
  }

  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  ${slideFooter(fonts)}
  ${body}
</svg>`
  );
  const base = await navyBase();
  return sharp(base).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

const EXPLAINERS: Record<string, { title: string; lines: string[] }> = {
  market_update: {
    title: 'WHAT IT MEANS',
    lines: [
      'For buyers: more days on market means more room to negotiate.',
      'For sellers: price to the recent solds, not to last year.',
      'Get the full snapshot for your street — tap the link.',
    ],
  },
  buyer_market: {
    title: 'GET FIRST LOOK',
    lines: [
      'New listings land in your inbox before the portals.',
      'Watch only the streets you actually want.',
      'No spam — just the homes. Tap the link.',
    ],
  },
  buyer_qualify: {
    title: 'HOW IT WORKS',
    lines: [
      'Answer 4 quick questions — about a minute, no forms to wrestle.',
      'See your number at three down-payment levels, instantly.',
      'Want it exact? We run it properly — free, no obligation.',
    ],
  },
  seller_push: {
    title: 'HOW IT WORKS',
    lines: [
      'Tell us the address.',
      'We pull the real sold data around it.',
      'You get your number — no obligation.',
    ],
  },
};

async function composeExplainerSlide(
  play: string,
  fonts: GraphicFonts | null
): Promise<Buffer> {
  const cfg = EXPLAINERS[play] || EXPLAINERS.seller_push;
  let body = '';
  const titleLines = wrapText(fonts, 'f800', cfg.title, 76, W - 116);
  titleLines.forEach((ln, i) => {
    body += slideText(fonts, 'f800', ln, 56, 340 + i * 82, 76, '#ffffff', 0, 'start', true);
  });
  let y = 340 + titleLines.length * 82 + 96;
  cfg.lines.forEach((p, idx) => {
    const lines = wrapText(fonts, 'f700', p, 42, W - 210);
    body += slideText(fonts, 'f800', `${idx + 1}`, 58, y, 54, RED);
    lines.forEach((ln, i) => {
      body += slideText(fonts, 'f700', ln, 128, y + i * 58, 42, '#ffffff');
    });
    y += lines.length * 58 + 56;
  });

  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  ${slideFooter(fonts)}
  ${body}
</svg>`
  );
  const base = await navyBase();
  return sharp(base).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

const TEAM_PITCH: Record<string, string> = {
  valuation: 'Get your number — tap the link',
  watch: "See what's selling near you — tap the link",
  giveaway: 'Enter now — tap the link',
};

async function composeTeamSlide(
  campaign: any,
  fonts: GraphicFonts | null
): Promise<Buffer> {
  const pitch =
    TEAM_PITCH[String(campaign.capture_type || '')] ||
    'Tap the link to get started';
  const reco1 = 'Tim Fennessey, Broker · Aidan Comeau, Sales Representative';
  const reco2 =
    'RE/MAX HALLMARK FIRST GROUP REALTY LTD. · info@thefcgroup.ca · 905 668-3800';
  const reco2Size = fitFooterSize(fonts, reco2, 24, 0.3);

  // The stored team asset (brand/email-hero.jpg) is the canonical
  // 600x200 email banner — kitchen | logo | team triptych — NOT a
  // portrait photo. It runs full-width at the top at its natural 3:1
  // ratio; a cover-crop would zoom into the logo panel. The banner
  // carries the logo itself, so no separate logo overlay here (and
  // no team-name text beside it, per the brand rule).
  const bannerH = Math.round((W * 200) / 600); // 360 at W=1080
  let texts =
    `<rect x="0" y="${bannerH}" width="${W}" height="4" fill="${RED}"/>` +
    slideText(fonts, 'f800', 'MEET YOUR TEAM', W / 2, bannerH + 170, 30, RED, 4, 'middle');
  const pitchLines = wrapText(fonts, 'f800', pitch.toUpperCase(), 58, W - 160);
  pitchLines.forEach((ln, i) => {
    texts += slideText(fonts, 'f800', ln, W / 2, bannerH + 268 + i * 72, 58, '#ffffff', 0, 'middle');
  });
  texts += slideText(
    fonts,
    'f600',
    '905 668-3800 · thefcgroup.ca',
    W / 2,
    bannerH + 268 + pitchLines.length * 72 + 58,
    30,
    '#ffffff',
    1,
    'middle'
  );
  const footer =
    `<rect x="0" y="${FOOTER_TOP - 4}" width="${W}" height="4" fill="${RED}"/>` +
    `<rect x="0" y="${FOOTER_TOP}" width="${W}" height="${H - FOOTER_TOP}" fill="${NAVY}"/>` +
    slideText(fonts, 'f600', reco1, W / 2, FOOTER_TOP + 34, 24, '#ffffff', 0.3, 'middle') +
    slideText(fonts, 'f600', reco2, W / 2, FOOTER_TOP + 64, reco2Size, '#ffffff', 0.3, 'middle');

  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${footer}
  ${texts}
</svg>`
  );

  const base = await navyBase();
  const composites: sharp.OverlayOptions[] = [{ input: svg, top: 0, left: 0 }];
  try {
    const banner = await sharp(await fetchBuffer(TEAM_PHOTO_URL))
      .resize({ width: W })
      .png()
      .toBuffer();
    composites.push({ input: banner, top: 0, left: 0 });
  } catch {
    // banner is garnish — the slide still reads fine on navy
  }
  return sharp(base).composite(composites).png().toBuffer();
}

// Compose the full 4-slide set (no storage writes — generation and the
// local proof harness share this).
export async function composeSlideSet(
  campaign: any,
  subject: CreativeSubject,
  idea: any | null,
  play: string,
  stats: MarketStatLine[]
): Promise<Buffer[]> {
  const fonts = await loadGraphicFonts();
  const region =
    (idea && typeof idea.subject === 'string' && idea.subject.trim()) ||
    subject.address ||
    '';
  const [s1, s2, s3, s4] = await Promise.all([
    composeLeadSlide(campaign, subject, idea, play, fonts),
    composeSubstanceSlide(play, region, stats, fonts),
    composeExplainerSlide(play, fonts),
    composeTeamSlide(campaign, fonts),
  ]);
  return [s1, s2, s3, s4];
}

async function uploadSlidePng(
  supabase: SupabaseClient,
  campaignId: string,
  n: number,
  png: Buffer
): Promise<string> {
  const path = `campaign-creatives/${campaignId}/slide-${n}.png`;
  const { error } = await supabase.storage
    .from(CREATIVE_BUCKET)
    .upload(path, png, { contentType: 'image/png', upsert: true });
  if (error) throw error;
  const { data: pub } = supabase.storage
    .from(CREATIVE_BUCKET)
    .getPublicUrl(path);
  return pub.publicUrl;
}

// Generate (or regenerate) the 4-slide designed set for a campaign
// that has no listing photos. Never throws for content problems: a
// failure is recorded on creative.error in plain words (slides stay
// as they were) and the creative is returned, so the card can show
// the snag and offer a retry.
export async function generateCampaignSlides(
  supabase: SupabaseClient,
  campaign: any
): Promise<CampaignCreative> {
  const prev = parseCreative(campaign.creative);
  try {
    const subject = await deriveSubject(supabase, campaign);
    const idea = await loadLinkedIdea(supabase, campaign.account_id, campaign.id);
    const play = resolveSlidePlay(campaign, subject);
    const stats =
      play === 'market_update' || play === 'buyer_market' || play === 'buyer_qualify'
        ? await loadMarketStats(supabase, campaign.account_id)
        : [];
    const buffers = await composeSlideSet(campaign, subject, idea, play, stats);
    const v = Date.now();
    const urls: string[] = [];
    for (let i = 0; i < buffers.length; i++) {
      urls.push(
        `${await uploadSlidePng(supabase, campaign.id, i + 1, buffers[i])}?v=${v}`
      );
    }
    const next: CampaignCreative = {
      photo_urls: urls.slice(1),
      designed_url: urls[0],
      approved: false,
      instagram: { ...EMPTY_INSTAGRAM },
      slides: urls,
      error: null,
    };
    await saveCreative(supabase, campaign.account_id, campaign.id, next);
    return next;
  } catch (err) {
    const next: CampaignCreative = { ...prev, error: plainSlideError(err) };
    await saveCreative(supabase, campaign.account_id, campaign.id, next);
    return next;
  }
}

// Unified regeneration: a campaign WITH a slide set (or with no
// photos at all) regenerates its slides; a photo campaign rebuilds
// its designed graphic. The creative route's "generate" action and
// the create/build bootstrap both go through here, so classification
// lives in exactly one place.
export async function generateCampaignCreative(
  supabase: SupabaseClient,
  campaign: any,
  heroUrl?: string | null
): Promise<CampaignCreative> {
  const creative = parseCreative(campaign.creative);
  if (!creative.slides.length && (heroUrl || creative.photo_urls.length)) {
    return generateCampaignGraphic(supabase, campaign, heroUrl);
  }
  return generateCampaignSlides(supabase, campaign);
}

// Fail-soft bootstrap used right after a campaign is created (idea
// build or manual create): fetch photos if none, generate the graphic
// if photos exist but no design yet. NEVER throws — a creative hiccup
// must not block campaign creation; the page's manual controls remain.
export async function ensureCampaignCreative(
  supabase: SupabaseClient,
  campaign: any
): Promise<void> {
  try {
    let creative = parseCreative(campaign.creative);
    if (!creative.photo_urls.length && !creative.slides.length) {
      creative = await fetchCampaignPhotos(supabase, campaign);
    }
    if (creative.photo_urls.length && !creative.designed_url) {
      await generateCampaignGraphic(
        supabase,
        { ...campaign, creative },
        null
      );
    } else if (!creative.photo_urls.length && !creative.slides.length) {
      // No listing photos exist for this campaign — it is not about
      // one house, so it gets the designed slide set instead.
      await generateCampaignSlides(supabase, { ...campaign, creative });
    }
  } catch {
    // fail-soft by design
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Lead Campaigns, layer 3 — creative: listing photos + a designed ad
// graphic on every campaign, reviewed on the Campaigns page before
// anything is posted (Tim's order, Nov 3, 2026).
//
// creative jsonb on lead_campaigns:
//   { photo_urls: string[], designed_url: string|null, approved: bool }
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
// red rule — "Tim Fennessey, Broker · 905 493-7355 · thefcgroup.ca".
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
}

export const EMPTY_CREATIVE: CampaignCreative = {
  photo_urls: [],
  designed_url: null,
  approved: false,
  instagram: { ...EMPTY_INSTAGRAM },
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
  return {
    photo_urls: urls.slice(0, MAX_PHOTOS),
    designed_url:
      typeof raw.designed_url === 'string' && raw.designed_url
        ? raw.designed_url
        : null,
    approved: raw.approved === true,
    instagram: parseInstagram(raw.instagram),
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
    d += g.getPath(cx, y, size).toPathData(2);
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
  const footerText =
    'Tim Fennessey, Broker · 905 493-7355 · thefcgroup.ca';
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
    const fw = measureText(fonts.f600, footerText, 27, 0.5);
    footer = `<path d="${textToPath(fonts.f600, footerText, (W - fw) / 2, FOOTER_TOP + 51, 27, 0.5)}" fill="#ffffff"/>`;
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
    footer = `<text x="${W / 2}" y="${FOOTER_TOP + 51}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="600" letter-spacing="0.5" fill="#ffffff">${esc(footerText)}</text>`;
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
    if (!creative.photo_urls.length) {
      creative = await fetchCampaignPhotos(supabase, campaign);
    }
    if (creative.photo_urls.length && !creative.designed_url) {
      await generateCampaignGraphic(
        supabase,
        { ...campaign, creative },
        null
      );
    }
  } catch {
    // fail-soft by design
  }
}

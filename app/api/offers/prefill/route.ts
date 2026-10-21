/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/offers/prefill — look up a listing by MLS# number and return
// the fields the offer workspace can pre-fill.
// Auth: signed-in team member (session + account membership) or the
// agent Bearer secret.
// Sources, in order:
//   1. PropTx DLA (back-office feed) when PROPTX_DLA_TOKEN is set — the
//      rich source (legal description, PIN, lot size, taxes, chattels).
//   2. The public IDX search on thefcgroup.ca — basics only (address,
//      city, list price). Seller legal names are in NO feed — the
//      workspace always asks for those.
// Body: { mls } -> { ok, source: 'DLA'|'IDX', prefill: {...} }

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const FC_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function authorized(req: NextRequest): Promise<boolean> {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (token && token === process.env.REA_AGENT_SECRET) return true;
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) return false;
  const { data } = await serviceClient()
    .from("account_users")
    .select("user_id")
    .eq("account_id", FC_ACCOUNT_ID)
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
}

function first(row: any, names: string[]): any {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null && row[n] !== "") return row[n];
  }
  return undefined;
}

function streetAddress(row: any): string | undefined {
  const unparsed = first(row, ["UnparsedAddress"]);
  if (unparsed) return String(unparsed).split(",")[0].trim();
  const parts = [
    first(row, ["StreetNumber"]),
    first(row, ["StreetName"]),
    first(row, ["StreetSuffix"]),
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

// Tim's standard chattels paragraph (dictated 2026-10-21). Every offer
// starts with it; anything the MLS listing includes beyond the standard
// list (pool, gazebo, shed, hot tub, stair lift…) is appended.
const STANDARD_CHATTELS =
  "All existing light fixtures, broadloom where laid. Window coverings, fridge, stove, dishwasher, washer, dryer, air conditioner, furnace and related equipment.";

const COVERED_CHATTEL_PATTERNS: RegExp[] = [
  /light fixture/,
  /broadloom/,
  /window covering|blinds|curtain|drape/,
  /fridge|refrigerator/,
  /stove|range|cooktop|oven/,
  /dishwasher/,
  /washer/,
  /dryer/,
  /air condition|central air|\ba\/c\b/,
  /furnace|heating|hvac/,
];

function composeChattels(row: any): string {
  const incl = String(first(row, ["Inclusions", "ChattelsIncluded"]) || "");
  const extras: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !extras.some((e) => e.toLowerCase() === t.toLowerCase())) extras.push(t);
  };
  if (incl) {
    for (const piece of incl.split(/[.,;]/)) {
      const item = piece.trim();
      if (!item) continue;
      if (COVERED_CHATTEL_PATTERNS.some((re) => re.test(item.toLowerCase()))) continue;
      push(item);
    }
  }
  const pool = first(row, ["PoolFeatures"]);
  if (
    Array.isArray(pool) &&
    pool.length > 0 &&
    !pool.every((p: any) => /^none$/i.test(String(p))) &&
    !extras.some((e) => /pool/i.test(e))
  ) {
    push("pool");
  }
  return extras.length
    ? `${STANDARD_CHATTELS} Also included: ${extras.join(", ")}.`
    : STANDARD_CHATTELS;
}

async function fromDLA(mls: string): Promise<any | null> {
  const token = process.env.PROPTX_DLA_TOKEN;
  if (!token) return null;
  const url =
    "https://query.ampre.ca/odata/Property?$top=1&$filter=" +
    encodeURIComponent(`ListingKey eq '${mls.replace(/'/g, "''")}'`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const data: any = await res.json().catch(() => null);
  const row = data?.value?.[0];
  if (!row) return null;
  const prefill: Record<string, any> = {};
  const addr = streetAddress(row);
  if (addr) prefill.address = addr;
  const city = first(row, ["City"]);
  if (city) prefill.city = city;
  const legal = first(row, ["TaxLegalDescription", "LegalDescription", "LegalDesc"]);
  if (legal) prefill.legal_description = legal;
  const pin = first(row, ["ParcelNumber", "PIN", "PinNumber", "TaxId"]);
  if (pin) prefill.pin = pin;
  const frontage = first(row, ["LotSizeFrontage", "Frontage", "LotWidth"]);
  if (frontage) prefill.frontage = String(frontage);
  const depth = first(row, ["LotSizeDepth", "Depth", "LotDepth"]);
  if (depth) prefill.depth = String(depth);
  const price = first(row, ["ListPrice"]);
  if (price) prefill.list_price = price;
  const taxes = first(row, ["TaxAnnualAmount", "TaxTotalAmount"]);
  if (taxes) prefill.taxes = taxes;
  prefill.chattels = composeChattels(row);
  const excl = first(row, ["Exclusions"]);
  if (excl) prefill.exclusions = excl;
  const office = first(row, ["ListOfficeName"]);
  if (office) prefill.listing_brokerage = office;
  // The DLA also knows WHO is listing it and what co-op commission is
  // offered — gold for the 801 and the Confirmation (320).
  const cleanAgent = (raw: any): string | undefined => {
    if (!raw) return undefined;
    let name = String(raw).split(",")[0].trim();
    if (!name) return undefined;
    if (name === name.toUpperCase()) {
      name = name
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return name;
  };
  const listAgent = cleanAgent(first(row, ["ListAgentFullName"]));
  if (listAgent) prefill.listing_agent = listAgent;
  const listPhone = first(row, ["ListAgentDirectPhone", "CoListOfficePhone"]);
  if (listPhone) prefill.listing_agent_phone = String(listPhone);
  const comp = first(row, ["TransactionBrokerCompensation"]);
  if (comp) {
    const pct = String(comp).replace("%", "").trim();
    if (pct) prefill.coop_share = pct;
  }
  return prefill;
}

async function fromIDX(mls: string): Promise<any | null> {
  // Exact-key lookup only — never fall back to a "close" listing; a wrong
  // prefill in an offer is worse than no prefill.
  const res = await fetch(
    `https://www.thefcgroup.ca/api/idx?mode=key&key=${encodeURIComponent(mls)}`
  ).catch(() => null);
  if (!res || !res.ok) return null;
  const data: any = await res.json().catch(() => null);
  const row = data?.listing;
  if (!row || row.ListingKey !== mls) return null;
  const prefill: Record<string, any> = {};
  const addr = streetAddress(row);
  if (addr) prefill.address = addr;
  if (row.City) prefill.city = row.City;
  if (row.ListPrice) prefill.list_price = row.ListPrice;
  if (row.PostalCode) prefill.postal_code = row.PostalCode;
  if (row.ListOfficeName) prefill.listing_brokerage = row.ListOfficeName;
  return prefill;
}

function streetNameFromAddress(addr: string): string | undefined {
  const m = addr.match(/^\s*\d+[A-Za-z]?\s+(.+)$/);
  if (!m) return undefined;
  const name = m[1].replace(/,?\s*(unit|apt|apartment|suite|ste|#).*$/i, "").trim();
  return name || undefined;
}

async function byKey(key: string): Promise<any | null> {
  const dla = await fromDLA(key);
  const idx = dla ? null : await fromIDX(key);
  const prefill = dla || idx;
  if (!prefill) return null;
  if (prefill.address) {
    const sn = streetNameFromAddress(prefill.address);
    if (sn) prefill.street_name = sn;
    // NOTE: no street-side guess — "Fronting on the" starts blank and
    // is answered by a person (Tim, 2026-10-21: a guessed side "could
    // be missed" and ship wrong).
  }
  return { ok: true, source: dla ? "DLA" : "IDX", prefill };
}

function normText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function searchCandidates(query: string): Promise<any[]> {
  // Address suggestions from the MLS feed (Durham + Kawarthas scope).
  // The feed search needs an exact substring, so probe with the most
  // reliable token (street number first, else the longest word), pull a
  // wider net, then rank loosely in code — spaces and small typos in
  // what the agent typed ("928 Blackcherry Drive") still surface the
  // right house ("928 Black Cherry Drive").
  const tokens = query.split(/\s+/).filter(Boolean);
  const numToken = tokens.find((t) => /^\d+$/.test(t));
  const wordToken = tokens
    .filter((t) => /[a-zA-Z]/.test(t))
    .sort((a, b) => b.length - a.length)[0];
  // Probe with BOTH the street number and the longest word, then merge —
  // a number-only probe ("8") drowns in matches, a word-only probe can
  // miss; together they reliably surface the right house.
  const probes = Array.from(
    new Set([numToken, wordToken, query].filter(Boolean) as string[])
  );
  const byKey = new Map<string, any>();
  for (const probe of probes) {
    const params = new URLSearchParams({
      mode: "search",
      scope: "local",
      q: probe,
      top: "25",
    });
    const res = await fetch(`https://www.thefcgroup.ca/api/idx?${params}`).catch(
      () => null
    );
    if (!res || !res.ok) continue;
    const data: any = await res.json().catch(() => null);
    for (const l of data?.listings || []) {
      if (!byKey.has(l.ListingKey)) byKey.set(l.ListingKey, l);
    }
  }
  const rows: any[] = Array.from(byKey.values());
  const nq = normText(query);
  const scored = rows
    .map((l: any) => {
      const addr = streetAddress(l) || "";
      const na = normText(`${addr} ${l.City || ""}`);
      let score = 0;
      if (nq.length >= 3 && na.startsWith(nq)) score += 100;
      else if (nq.length >= 3 && na.includes(nq)) score += 60;
      for (const t of tokens) {
        const nt = normText(t);
        if (nt.length < 3) continue;
        if (na.includes(nt)) {
          score += 10;
        } else {
          const words = `${addr} ${l.City || ""}`.split(/\s+/).map(normText);
          if (
            words.some(
              (w) => w.startsWith(nt.slice(0, 4)) || nt.startsWith(w.slice(0, 4))
            )
          ) {
            score += 4;
          }
        }
      }
      if (numToken && !addr.startsWith(numToken)) score -= 15;
      return { l, addr, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return scored.map(({ l, addr }) => ({
    key: l.ListingKey,
    address: addr,
    city: l.City,
    list_price: l.ListPrice,
    beds: l.BedroomsTotal,
    baths: l.BathroomsTotalInteger,
  }));
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as any;
    const mls = String(body.mls || "").trim().toUpperCase();
    if (mls) {
      const hit = await byKey(mls);
      if (hit) return NextResponse.json(hit);
      return NextResponse.json({
        ok: false,
        code: "not_found",
        error: `No listing found for MLS# ${mls}. You can still fill the form in manually.`,
      });
    }
    const suggest = String(body.suggest || "").trim();
    if (suggest) {
      return NextResponse.json({ ok: true, candidates: await searchCandidates(suggest) });
    }
    const query = String(body.query || "").trim();
    if (query) {
      // A bare token with no spaces might be an MLS# typed in the
      // address box — try the exact-key path first.
      if (!/\s/.test(query)) {
        const hit = await byKey(query.toUpperCase());
        if (hit) return NextResponse.json(hit);
      }
      const candidates = await searchCandidates(query);
      if (candidates.length) return NextResponse.json({ ok: true, candidates });
      return NextResponse.json({
        ok: false,
        code: "not_found",
        error: `No listings matched "${query}". Try the MLS# number, or fill the form in manually.`,
      });
    }
    return NextResponse.json(
      { ok: false, error: "Need an MLS# number or an address." },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "Prefill failed." },
      { status: 500 }
    );
  }
}

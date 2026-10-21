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
  const legal = first(row, ["LegalDescription", "LegalDesc"]);
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
  const incl = first(row, ["Inclusions", "ChattelsIncluded"]);
  if (incl) prefill.chattels = incl;
  const excl = first(row, ["Exclusions"]);
  if (excl) prefill.exclusions = excl;
  const office = first(row, ["ListOfficeName"]);
  if (office) prefill.listing_brokerage = office;
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

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as any;
    const mls = String(body.mls || "").trim().toUpperCase();
    if (!mls) {
      return NextResponse.json({ ok: false, error: "Need an MLS# number." }, { status: 400 });
    }
    const dla = await fromDLA(mls);
    if (dla) return NextResponse.json({ ok: true, source: "DLA", prefill: dla });
    const idx = await fromIDX(mls);
    if (idx) return NextResponse.json({ ok: true, source: "IDX", prefill: idx });
    return NextResponse.json({
      ok: false,
      code: "not_found",
      error: `No listing found for MLS# ${mls}. You can still fill the form in manually.`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "Prefill failed." },
      { status: 500 }
    );
  }
}

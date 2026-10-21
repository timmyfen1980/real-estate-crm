/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/property-status — agent-side property categorization.
// Auth: Bearer REA_AGENT_SECRET.
//
// GET  -> every property in the account with the deal types linked to it,
//         plus a suggestion: a 'for_sale' property whose deals are buyer
//         deals (and no seller deal) is a purchase, not a listing.
// POST { ids: string[], status } -> set the status on those properties.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const FC_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";
const ALLOWED = [
  "coming_soon",
  "for_sale",
  "purchased",
  "sold",
  "for_lease",
  "leased",
  "closed",
];

function unauthorized(req: NextRequest): boolean {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  return !token || token !== process.env.REA_AGENT_SECRET;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  if (unauthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const supabase = serviceClient();
  const { data: props, error } = await supabase
    .from("properties")
    .select("id,address,city,status")
    .eq("account_id", FC_ACCOUNT_ID)
    .order("address");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }
  const { data: deals } = await supabase
    .from("deals")
    .select("*")
    .eq("account_id", FC_ACCOUNT_ID);
  const byProperty = new Map<string, any[]>();
  for (const d of (deals || []) as any[]) {
    if (!d.property_id) continue;
    const arr = byProperty.get(d.property_id) || [];
    arr.push({
      id: d.id,
      type: (d.deal_type || d.type || "").toString().toLowerCase() || null,
      status: d.status,
    });
    byProperty.set(d.property_id, arr);
  }
  const properties = (props || []).map((p: any) => {
    const linked = byProperty.get(p.id) || [];
    const types = linked.map((d) => d.type).filter(Boolean) as string[];
    const suggestion =
      p.status === "for_sale" && types.includes("buyer") && !types.includes("seller")
        ? "purchased"
        : null;
    return { ...p, deals: linked, suggestion };
  });
  return NextResponse.json({ ok: true, properties });
}

export async function POST(req: NextRequest) {
  if (unauthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as any;
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const status = String(body.status || "");
  if (ids.length === 0 || !ALLOWED.includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Need ids[] and a valid status." },
      { status: 400 }
    );
  }
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("properties")
    .update({ status })
    .in("id", ids)
    .eq("account_id", FC_ACCOUNT_ID)
    .select("id,address,status");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, updated: (data || []).length, rows: data });
}

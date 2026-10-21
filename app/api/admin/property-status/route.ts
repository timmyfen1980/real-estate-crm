/* eslint-disable @typescript-eslint/no-explicit-any */
// /api/admin/property-status — agent-side property categorization.
// Auth: Bearer REA_AGENT_SECRET.
//
// GET  -> every property in the account with the deals linked to it, a
//         suggested category (buyer purchases mislabeled 'for_sale' ->
//         'purchased'; a listing whose seller deal is Sold Firm/Closed
//         -> 'sold'), and a count of dangling property_contacts links
//         (rows pointing at contacts that no longer exist — these crash
//         the property detail page render).
// POST { ids, status }            -> set the status on those properties.
// POST { action: 'cleanup_links' } -> delete dangling property_contacts rows.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const FC_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";
const ALLOWED = [
  "coming_soon",
  "for_sale",
  "purchased",
  "not_our_listing",
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

async function danglingLinks(supabase: any, propertyIds: string[]) {
  const { data: links } = await supabase
    .from("property_contacts")
    .select("property_id,contact_id")
    .in("property_id", propertyIds);
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id")
    .eq("account_id", FC_ACCOUNT_ID);
  const valid = new Set((contacts || []).map((c: any) => c.id));
  return (links || []).filter((l: any) => !valid.has(l.contact_id));
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
  const dangling = await danglingLinks(
    supabase,
    (props || []).map((p: any) => p.id)
  );
  const danglingByProperty = new Map<string, number>();
  for (const d of dangling) {
    danglingByProperty.set(d.property_id, (danglingByProperty.get(d.property_id) || 0) + 1);
  }
  const properties = (props || []).map((p: any) => {
    const linked = byProperty.get(p.id) || [];
    const types = linked.map((d) => d.type).filter(Boolean) as string[];
    let suggestion: string | null = null;
    if (p.status === "for_sale" && types.includes("buyer") && !types.includes("seller")) {
      suggestion = "purchased";
    } else if (
      p.status === "for_sale" &&
      types.includes("seller") &&
      !types.includes("buyer") &&
      linked.some((d) => d.status === "Sold Firm" || d.status === "Closed")
    ) {
      suggestion = "sold";
    }
    return {
      ...p,
      deals: linked,
      suggestion,
      dangling_links: danglingByProperty.get(p.id) || 0,
    };
  });
  return NextResponse.json({
    ok: true,
    properties,
    dangling_total: dangling.length,
  });
}

export async function POST(req: NextRequest) {
  if (unauthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as any;
  const supabase = serviceClient();

  if (body.action === "cleanup_links") {
    const { data: props } = await supabase
      .from("properties")
      .select("id")
      .eq("account_id", FC_ACCOUNT_ID);
    const dangling = await danglingLinks(
      supabase,
      (props || []).map((p: any) => p.id)
    );
    let removed = 0;
    for (const d of dangling) {
      const { error } = await supabase
        .from("property_contacts")
        .delete()
        .eq("property_id", d.property_id)
        .eq("contact_id", d.contact_id);
      if (!error) removed++;
    }
    return NextResponse.json({ ok: true, found: dangling.length, removed });
  }

  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const status = String(body.status || "");
  if (ids.length === 0 || !ALLOWED.includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Need ids[] and a valid status." },
      { status: 400 }
    );
  }
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

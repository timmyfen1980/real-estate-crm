/* eslint-disable @typescript-eslint/no-explicit-any */
// Offer packages — the document home for each offer (Offers tab).
// A package groups every form for one property (generated or uploaded),
// each document tracked signed / unsigned, ready to go out together
// when the iinked Sign hookup lands.
// Auth: signed-in team member (session + account membership) or the
// agent Bearer secret.
//   GET                          -> { ok, packages: [...] } (address order)
//   POST { action: 'file_url', id, path }        -> signed download URL
//   POST { action: 'set_status', id, status }    -> package status
//   POST { action: 'set_doc_signed', id, path, signed }
//   POST { action: 'delete', id }                -> row + storage files
//   POST multipart { action: 'add_file', id, file } -> upload + append

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import {
  synCreatePackage,
  synEditLink,
  synPackageStatus,
  synRegisterEndpoint,
  synReadSettings,
  synWriteSettings,
  flattenPdfBytes,
  fileExecutedPackage,
  SYN_WEBHOOK_URL,
} from "@/lib/syngrafii";

const FC_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";
const BUCKET = "client-documents";

// The team's lawyer directory — one shared list (storage JSON), seeded
// with the lawyers Tim's clients already use. The workspace picker
// reads it and can add to it.
const LAWYER_PATH = "system/lawyer-directory.json";
const LAWYER_SEED = [
  { name: "Jonathan Griffiths", firm: "Griffiths Law", address: "", email: "", phone: "", fax: "" },
  { name: "Sarah Duff", firm: "Griffiths Law", address: "", email: "", phone: "", fax: "" },
];

async function readLawyers(supabase: any): Promise<any[]> {
  const { data, error } = await supabase.storage.from(BUCKET).download(LAWYER_PATH);
  if (error || !data) return [...LAWYER_SEED];
  try {
    const parsed = JSON.parse(await data.text());
    return Array.isArray(parsed) && parsed.length ? parsed : [...LAWYER_SEED];
  } catch {
    return [...LAWYER_SEED];
  }
}

async function writeLawyers(supabase: any, lawyers: any[]): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(lawyers, null, 2));
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(LAWYER_PATH, bytes, { contentType: "application/json", upsert: true });
  if (error) throw new Error(error.message);
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Minimal ZIP writer (STORE — PDFs are already compressed, so no
// deflate needed) for "Download all": the whole package as one file.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => new Uint8Array([v & 255, (v >>> 8) & 255]);
  const u32 = (v: number) =>
    new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
  const cat = (...bs: Uint8Array[]) => {
    const total = bs.reduce((n, b) => n + b.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const b of bs) {
      out.set(b, o);
      o += b.length;
    }
    return out;
  };
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = cat(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0),
      name, f.data
    );
    central.push(
      cat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name
      )
    );
    parts.push(local);
    offset += local.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = cat(
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cdSize), u32(offset), u16(0)
  );
  return cat(...parts, ...central, end);
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

function tableMissing(error: any): boolean {
  const msg = String(error?.message || "");
  return msg.includes("offer_packages") && (msg.includes("does not exist") || msg.includes("schema cache"));
}

const MONTH_INDEX: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// {day, month (name), year (2-digit)} -> ISO date, or null.
function isoFromParts(d: any): string | null {
  if (!d || !d.day || !d.year) return null;
  const m = MONTH_INDEX[String(d.month || "").toLowerCase()];
  if (!m) return null;
  const y = String(d.year).length === 2 ? `20${d.year}` : String(d.year);
  return `${y}-${String(m).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const supabase = serviceClient();
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (token && token === process.env.REA_AGENT_SECRET) {
    const { data: owner } = await supabase
      .from("account_users")
      .select("user_id")
      .eq("account_id", FC_ACCOUNT_ID)
      .eq("role", "owner")
      .maybeSingle();
    return owner?.user_id || null;
  }
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
  return user?.id || null;
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const supabase = serviceClient();
    const url = new URL(req.url);

    // The shared lawyer directory.
    if (url.searchParams.get("lawyers")) {
      const lawyers = await readLawyers(supabase);
      return NextResponse.json({ ok: true, lawyers });
    }

    // Single package, including the deal snapshot (workspace page).
    const oneId = url.searchParams.get("id");

    // Download ALL of a package's documents as one zip (Tim, 2026-10-21).
    if (oneId && url.searchParams.get("download_all")) {
      const { data, error } = await supabase
        .from("offer_packages")
        .select("*")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", oneId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      const docs = Array.isArray(data.documents) ? data.documents : [];
      const used = new Set<string>();
      const files: { name: string; data: Uint8Array }[] = [];
      for (const d of docs) {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(d.path, 120);
        if (!signed?.signedUrl) continue;
        const r = await fetch(signed.signedUrl);
        if (!r.ok) continue;
        let name = String(d.filename || "document.pdf");
        if (used.has(name)) {
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${name.slice(0, dot)} (2)${name.slice(dot)}` : `${name} (2)`;
        }
        used.add(name);
        files.push({ name, data: new Uint8Array(await r.arrayBuffer()) });
      }
      const zip = zipStore(files);
      const zipName = `${String(data.address || "offer").replace(/[^\w\- ]+/g, "").trim()} - offer package.zip`;
      return new Response(Buffer.from(zip), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${zipName}"`,
        },
      });
    }

    if (oneId) {
      const { data, error } = await supabase
        .from("offer_packages")
        .select("*")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", oneId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      return NextResponse.json({ ok: true, package: data });
    }

    // The Documents library (team-docs folders), for "add from library".
    if (url.searchParams.get("library")) {
      const files: any[] = [];
      for (const folder of ["buyer", "seller"]) {
        const { data } = await supabase.storage
          .from(BUCKET)
          .list(`team-docs/${folder}`, { limit: 100 });
        for (const f of data || []) {
          if (f.name && !f.name.startsWith(".")) {
            files.push({
              name: f.name,
              folder,
              path: `team-docs/${folder}/${f.name}`,
            });
          }
        }
      }
      return NextResponse.json({ ok: true, files });
    }
    const { data, error } = await supabase
      .from("offer_packages")
      .select("id,address,city,mls,status,partial,documents,created_at,updated_at")
      .eq("account_id", FC_ACCOUNT_ID)
      .order("address", { ascending: true });
    if (error) {
      if (tableMissing(error)) {
        return NextResponse.json({ ok: true, packages: [], table_missing: true });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, packages: data || [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "List failed." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const supabase = serviceClient();
    const contentType = req.headers.get("content-type") || "";

    // --- multipart: add a file to a package ---
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const id = String(formData.get("id") || "");
      const file = formData.get("file") as File | null;
      if (!id || !file) {
        return NextResponse.json({ ok: false, error: "Need a package id and a file." }, { status: 400 });
      }
      const { data: pkg, error } = await supabase
        .from("offer_packages")
        .select("id,documents")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!pkg) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      const safeName = (file.name || "document.pdf").replace(/[^\w.\- ]+/g, "_");
      const path = `offers/${id}/${Date.now()}-${safeName}`;
      const bytes = await file.arrayBuffer();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: file.type || "application/pdf", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const docForm =
        String(formData.get("doc_form") || "") === "schedule_b" ? "schedule_b" : "file";
      const docs = Array.isArray(pkg.documents) ? [...pkg.documents] : [];
      docs.push({
        form: docForm,
        filename: safeName,
        path,
        signed: false,
        added_at: new Date().toISOString(),
      });
      const { error: updErr } = await supabase
        .from("offer_packages")
        .update({ documents: docs })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      return NextResponse.json({ ok: true, documents: docs });
    }

    // --- JSON actions ---
    const body = (await req.json().catch(() => ({}))) as any;

    // --- Deal linking (Tim, 2026-10-22): "Create / Link to Deal".
    // A linked package's documents mirror onto the deal's page
    // automatically (signed replacing unsigned). Writes need the
    // one-time deal-link-setup.sql (offer_packages.deal_id); until it
    // runs they answer setup_needed instead of failing obscurely.
    const dealSetupNeeded = (error: any) =>
      String(error?.message || "").includes("deal_id");
    const normAddr = (s: string) =>
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const summarizeDeals = async (rows: any[]) => {
      if (!rows.length) return [];
      const propIds = [...new Set(rows.map((r) => r.property_id).filter(Boolean))];
      const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
      const { data: props } = await supabase
        .from("properties")
        .select("id,address")
        .in("id", propIds.length ? propIds : ["-"]);
      const { data: cons } = await supabase
        .from("contacts")
        .select("id,first_name,last_name")
        .in("id", contactIds.length ? contactIds : ["-"]);
      const propMap = new Map((props || []).map((p: any) => [p.id, p.address]));
      const conMap = new Map(
        (cons || []).map((c: any) => [c.id, `${c.first_name || ""} ${c.last_name || ""}`.trim()])
      );
      return rows.map((r) => ({
        deal_id: r.id,
        address: propMap.get(r.property_id) || "",
        contact_name: conMap.get(r.contact_id) || "",
        deal_type: r.deal_type,
        status: r.status,
        closing_date: r.closing_date || null,
      }));
    };
    const loadPkgRow = async () => {
      const { data, error } = await supabase
        .from("offer_packages")
        .select("*")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", body.id || "")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    };

    if (body.action === "deal_suggestions") {
      const pkg = await loadPkgRow();
      if (!pkg) {
        return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      }
      const snap = pkg.deal || {};
      const pkgAddr = normAddr(pkg.address || "");
      const clientContactId = snap?.client?.contact_id || null;
      const { data: dealRows } = await supabase
        .from("deals")
        .select("id,contact_id,property_id,deal_type,status,closing_date")
        .eq("account_id", FC_ACCOUNT_ID);
      const summaries = await summarizeDeals(dealRows || []);
      const suggestions = summaries
        .map((s) => {
          let score = 0;
          const reasons: string[] = [];
          const dAddr = normAddr(s.address);
          if (
            dAddr &&
            pkgAddr &&
            (dAddr === pkgAddr || dAddr.includes(pkgAddr) || pkgAddr.includes(dAddr))
          ) {
            score += 2;
            reasons.push("same property");
          }
          const row = (dealRows || []).find((r: any) => r.id === s.deal_id);
          if (clientContactId && row && row.contact_id === clientContactId) {
            score += 2;
            reasons.push("same client");
          }
          return { ...s, reason: reasons.join(" + ") , score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ score, ...rest }) => rest);
      let linked: any = null;
      if ((pkg as any).deal_id) {
        const row = (dealRows || []).find((r: any) => r.id === (pkg as any).deal_id);
        if (row) {
          const [sum] = await summarizeDeals([row]);
          linked = sum || null;
        }
      }
      let typeGuess = "buyer";
      if (snap?.client?.client_file_id) {
        const { data: cf } = await supabase
          .from("client_files")
          .select("checklist_types")
          .eq("id", snap.client.client_file_id)
          .maybeSingle();
        const types: string[] = cf?.checklist_types || [];
        if (types.includes("seller")) typeGuess = "seller";
        else if (types.includes("tenant") || types.includes("landlord")) typeGuess = "lease";
      }
      const codes: string[] = Array.isArray(snap?.standard_codes) ? snap.standard_codes : ["B", "C"]; // unset = all standards on (the generator default), so the financing + inspection conditions count
      return NextResponse.json({
        ok: true,
        linked,
        suggestions,
        prefill: {
          deal_type: typeGuess,
          status: codes.includes("B") || codes.includes("C") ? "Sold Conditional" : "Sold Firm",
          closing_date: isoFromParts(snap?.completion_date),
        },
      });
    }

    if (body.action === "link_deal") {
      const pkg = await loadPkgRow();
      if (!pkg) {
        return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      }
      const { data: dealRow } = await supabase
        .from("deals")
        .select("id")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", body.deal_id || "")
        .maybeSingle();
      if (!dealRow) {
        return NextResponse.json({ ok: false, error: "That deal was not found." }, { status: 404 });
      }
      const { error } = await supabase
        .from("offer_packages")
        .update({ deal_id: body.deal_id })
        .eq("id", pkg.id);
      if (error) {
        if (dealSetupNeeded(error)) {
          return NextResponse.json(
            { ok: false, code: "setup_needed", error: "Deal linking needs a one-time database step first — Rea has the SQL for it." },
            { status: 400 }
          );
        }
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, deal_id: body.deal_id });
    }

    if (body.action === "unlink_deal") {
      const pkg = await loadPkgRow();
      if (!pkg) {
        return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      }
      const { error } = await supabase
        .from("offer_packages")
        .update({ deal_id: null })
        .eq("id", pkg.id);
      if (error) {
        if (dealSetupNeeded(error)) {
          return NextResponse.json(
            { ok: false, code: "setup_needed", error: "Deal linking needs a one-time database step first — Rea has the SQL for it." },
            { status: 400 }
          );
        }
        throw new Error(error.message);
      }
      return NextResponse.json({ ok: true, deal_id: null });
    }

    if (body.action === "create_deal") {
      // Probe the link column first, so a missing setup step never
      // leaves a half-created deal behind.
      const probe = await supabase.from("offer_packages").select("deal_id").limit(1);
      if (probe.error) {
        return NextResponse.json(
          { ok: false, code: "setup_needed", error: "Deal linking needs a one-time database step first — Rea has the SQL for it." },
          { status: 400 }
        );
      }
      const pkg = await loadPkgRow();
      if (!pkg) {
        return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      }
      const snap = pkg.deal || {};
      const dealType = ["buyer", "seller", "lease"].includes(body.deal_type)
        ? body.deal_type
        : "buyer";
      // Property: find by address, else create (never touching an
      // existing property's status).
      const { data: props } = await supabase
        .from("properties")
        .select("id,address")
        .eq("account_id", FC_ACCOUNT_ID);
      const pkgAddr = normAddr(pkg.address || "");
      let property = (props || []).find((p: any) => normAddr(p.address) === pkgAddr);
      if (!property) {
        const { data: created, error: propErr } = await supabase
          .from("properties")
          .insert([
            {
              account_id: FC_ACCOUNT_ID,
              address: pkg.address,
              user_id: pkg.created_by || null,
              status: dealType === "seller" ? "for_sale" : dealType === "lease" ? "for_lease" : "purchased",
            },
          ])
          .select("id,address")
          .single();
        if (propErr) throw new Error(propErr.message);
        property = created;
      }
      // One deal per property — the CRM's own duplicate rule.
      const { data: existing } = await supabase
        .from("deals")
        .select("id,status")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("property_id", property.id)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          {
            ok: false,
            code: "deal_exists",
            deal_id: existing.id,
            error: "A deal already exists for this property — link this package to it instead.",
          },
          { status: 409 }
        );
      }
      // Contact: the package's client, else a unique name match on
      // our side of the deal.
      let contactId: string | null = snap?.client?.contact_id || null;
      if (contactId) {
        const { data: c } = await supabase
          .from("contacts")
          .select("id")
          .eq("account_id", FC_ACCOUNT_ID)
          .eq("id", contactId)
          .maybeSingle();
        if (!c) contactId = null;
      }
      if (!contactId) {
        const names: string[] =
          dealType === "seller" ? snap?.sellers || [] : snap?.buyers || [];
        const first = String(names[0] || "").trim();
        if (first) {
          const parts = first.split(/\s+/);
          const { data: matches } = await supabase
            .from("contacts")
            .select("id,first_name,last_name")
            .eq("account_id", FC_ACCOUNT_ID)
            .ilike("first_name", parts[0])
            .ilike("last_name", parts.slice(1).join(" ") || "%");
          if (matches && matches.length === 1) contactId = matches[0].id;
        }
      }
      if (!contactId) {
        return NextResponse.json(
          {
            ok: false,
            code: "no_client",
            error:
              "This package isn't tied to a client yet, so the deal would have no person. Pick the client on the package first (they're chosen in Step 1), then try again.",
          },
          { status: 400 }
        );
      }
      const codes: string[] = Array.isArray(snap?.standard_codes) ? snap.standard_codes : ["B", "C"]; // unset = all standards on (the generator default), so the financing + inspection conditions count
      const status = ["Active", "Sold Conditional", "Sold Firm", "Closed"].includes(body.status)
        ? body.status
        : codes.includes("B") || codes.includes("C")
          ? "Sold Conditional"
          : "Sold Firm";
      const closingIso = isoFromParts(snap?.completion_date);
      const assigned = pkg.created_by || (await resolveUserId(req));
      const { data: newDeal, error: dealErr } = await supabase
        .from("deals")
        .insert([
          {
            account_id: FC_ACCOUNT_ID,
            contact_id: contactId,
            property_id: property.id,
            assigned_user_id: assigned,
            deal_type: dealType,
            status,
            closing_date: closingIso,
          },
        ])
        .select("id")
        .single();
      if (dealErr) throw new Error(dealErr.message);
      const { error: linkErr } = await supabase
        .from("offer_packages")
        .update({ deal_id: newDeal.id })
        .eq("id", pkg.id);
      if (linkErr) throw new Error(linkErr.message);
      const [summary] = await summarizeDeals([
        {
          id: newDeal.id,
          contact_id: contactId,
          property_id: property.id,
          deal_type: dealType,
          status,
          closing_date: closingIso,
        },
      ]);
      return NextResponse.json({ ok: true, deal_id: newDeal.id, linked: summary || null });
    }

    if (body.action === "add_lawyer") {
      const lw = body.lawyer || {};
      const name = String(lw.name || "").trim();
      if (!name) {
        return NextResponse.json({ ok: false, error: "A lawyer name is required." }, { status: 400 });
      }
      const entry = {
        name,
        firm: String(lw.firm || "").trim(),
        address: String(lw.address || "").trim(),
        email: String(lw.email || "").trim(),
        phone: String(lw.phone || "").trim(),
        fax: String(lw.fax || "").trim(),
      };
      const lawyers = await readLawyers(supabase);
      const key = (e: any) => `${e.name}|${e.firm}`.toLowerCase();
      if (!lawyers.some((e: any) => key(e) === key(entry))) {
        lawyers.push(entry);
        await writeLawyers(supabase, lawyers);
      }
      return NextResponse.json({ ok: true, lawyers });
    }

    if (body.action === "create") {
      const deal = body.deal || {};
      const prop = deal.property || {};
      const userId = await resolveUserId(req);
      const { data: pkg, error } = await supabase
        .from("offer_packages")
        .insert({
          account_id: FC_ACCOUNT_ID,
          created_by: userId,
          address: prop.address || body.address || "Untitled offer",
          city: prop.city || body.city || null,
          mls: prop.mls || body.mls || null,
          status: "draft",
          partial: false,
          deal,
          documents: [],
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: pkg.id });
    }

    if (body.action === "register_webhook") {
      // One-time setup: register the CRM's webhook URL with iinked and
      // keep the endpoint secret server-side (storage JSON). Safe to
      // re-run — it reports the existing registration instead of
      // creating a duplicate.
      const existing = await synReadSettings(supabase);
      if (existing?.secret) {
        return NextResponse.json({ ok: true, already: true, endpoint_id: existing.endpoint_id || null });
      }
      const data = await synRegisterEndpoint(SYN_WEBHOOK_URL, "FC Group CRM");
      const endpoint = data?.endpoint || data;
      if (!endpoint?.secret) {
        throw new Error("iinked did not return a webhook secret.");
      }
      await synWriteSettings(supabase, {
        endpoint_id: endpoint.eventEndpointId || endpoint.id || null,
        url: SYN_WEBHOOK_URL,
        secret: endpoint.secret,
        registered_at: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, endpoint_id: endpoint.eventEndpointId || endpoint.id || null });
    }

    const id = String(body.id || "");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Need a package id." }, { status: 400 });
    }

    if (body.action === "update_deal") {
      const deal = body.deal || {};
      // The iinked linkage (deal.syngrafii + deal.syngrafii_sends) is
      // server-owned: a workspace autosave built from page state must
      // never wipe it.
      if (!deal.syngrafii || !deal.syngrafii_sends) {
        const { data: cur } = await supabase
          .from("offer_packages")
          .select("deal")
          .eq("account_id", FC_ACCOUNT_ID)
          .eq("id", id)
          .maybeSingle();
        if (cur?.deal?.syngrafii && !deal.syngrafii) deal.syngrafii = cur.deal.syngrafii;
        if (cur?.deal?.syngrafii_sends && !deal.syngrafii_sends) {
          deal.syngrafii_sends = cur.deal.syngrafii_sends;
        }
      }
      const prop = deal.property || {};
      const { error } = await supabase
        .from("offer_packages")
        .update({
          deal,
          address: prop.address || undefined,
          city: prop.city || undefined,
          mls: prop.mls || undefined,
        })
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "attach_library") {
      const libPath = String(body.path || "");
      const name = String(body.name || "document.pdf");
      if (!libPath.startsWith("team-docs/")) {
        return NextResponse.json({ ok: false, error: "Bad library path." }, { status: 400 });
      }
      const { data: pkg, error } = await supabase
        .from("offer_packages")
        .select("id,documents")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!pkg) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(libPath);
      if (dlErr || !blob) throw new Error(dlErr?.message || "Could not read the library file.");
      const safeName = name.replace(/[^\w.\- ]+/g, "_");
      const path = `offers/${id}/${Date.now()}-${safeName}`;
      const bytes = await blob.arrayBuffer();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: blob.type || "application/pdf", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const docs = Array.isArray(pkg.documents) ? [...pkg.documents] : [];
      docs.push({
        form: "library",
        filename: safeName,
        path,
        signed: false,
        added_at: new Date().toISOString(),
      });
      const { error: updErr } = await supabase
        .from("offer_packages")
        .update({ documents: docs })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      return NextResponse.json({ ok: true, documents: docs });
    }

    if (body.action === "file_url") {
      const path = String(body.path || "");
      if (!path.startsWith(`offers/${id}/`)) {
        return NextResponse.json({ ok: false, error: "Bad file path." }, { status: 400 });
      }
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, url: data.signedUrl });
    }

    if (body.action === "set_status") {
      const { error } = await supabase
        .from("offer_packages")
        .update({ status: String(body.status || "draft") })
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set_doc_signed") {
      const { data: pkg, error } = await supabase
        .from("offer_packages")
        .select("id,documents")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!pkg) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      const docs = (Array.isArray(pkg.documents) ? pkg.documents : []).map((d: any) =>
        d.path === body.path ? { ...d, signed: body.signed === true } : d
      );
      const { error: updErr } = await supabase
        .from("offer_packages")
        .update({ documents: docs })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      return NextResponse.json({ ok: true, documents: docs });
    }

    if (body.action === "delete_doc") {
      // Remove ONE file from the package: its documents entry and the
      // stored object both go. (Tim, 2026-10-21.)
      const { data: pkg, error } = await supabase
        .from("offer_packages")
        .select("id,documents")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!pkg) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      const docs = (Array.isArray(pkg.documents) ? pkg.documents : []).filter(
        (d: any) => d.path !== body.path
      );
      if (body.path) {
        await supabase.storage.from(BUCKET).remove([String(body.path)]);
      }
      const { error: updErr } = await supabase
        .from("offer_packages")
        .update({ documents: docs })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      return NextResponse.json({ ok: true, documents: docs });
    }

    if (body.action === "prepare_signature") {
      // Editor-first flow (Tim, 2026-10-21): the chosen documents are
      // FLATTENED (values printed into the page so iinked's engine can't
      // re-draw them off their lines) and sent to iinked as a DRAFT
      // package with the signers preloaded. Tim then lands in the
      // iinked editor via a secure edit link to place signature /
      // initial spots and send it himself. Signed copies return via
      // the webhook (fileExecutedPackage).
      const { data: pkg, error } = await supabase
        .from("offer_packages")
        .select("id,address,deal,documents,status")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!pkg) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      const wantPaths: string[] = Array.isArray(body.paths) ? body.paths.map(String) : [];
      const allDocs: any[] = Array.isArray(pkg.documents) ? pkg.documents : [];
      const chosen = allDocs.filter(
        (d) => wantPaths.includes(d.path) && !d.signed && String(d.filename || "").toLowerCase().endsWith(".pdf")
      );
      if (!chosen.length) {
        return NextResponse.json(
          { ok: false, error: "Choose at least one unsigned PDF to send." },
          { status: 400 }
        );
      }
      const rawSigners: any[] = Array.isArray(body.signers) ? body.signers : [];
      const signers = rawSigners
        .map((s) => {
          const full = String(s?.name || "").trim();
          const email = String(s?.email || "").trim();
          const cut = full.indexOf(" ");
          return {
            firstName: cut > 0 ? full.slice(0, cut) : full,
            lastName: cut > 0 ? full.slice(cut + 1) : "",
            email,
          };
        })
        .filter((s) => s.firstName && s.email.includes("@"));
      if (!signers.length) {
        return NextResponse.json(
          { ok: false, error: "Add at least one signer with a name and an email." },
          { status: 400 }
        );
      }
      const synDocs: { fileName: string; fileData: string }[] = [];
      const sentMeta: { path: string; filename: string; flattened: boolean }[] = [];
      for (const d of chosen) {
        const { data: signedUrl, error: sErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(d.path, 180);
        if (sErr || !signedUrl?.signedUrl) {
          throw new Error(sErr?.message || `Could not read ${d.filename}.`);
        }
        const r = await fetch(signedUrl.signedUrl);
        if (!r.ok) throw new Error(`Could not read ${d.filename}.`);
        const raw = new Uint8Array(await r.arrayBuffer());
        const flat = await flattenPdfBytes(raw);
        synDocs.push({
          fileName: d.filename,
          fileData: Buffer.from(flat.bytes).toString("base64"),
        });
        sentMeta.push({ path: d.path, filename: d.filename, flattened: flat.flattened });
      }
      const created = await synCreatePackage({
        name: `${pkg.address || "Offer"} — documents for signature`,
        type: signers.length > 1 ? "Sequential" : "concurrent",
        state: "draft",
        signers,
        documents: synDocs,
        message: String(body.message || "").trim() || undefined,
      });
      const synPkg = created?.package || {};
      const synPackageId = created?.packageId || synPkg?.packageId;
      if (!synPackageId) {
        throw new Error("iinked did not return a package id.");
      }
      const createdDocs: any[] = Array.isArray(synPkg.documents) ? synPkg.documents : [];
      const docMap = sentMeta.map((m) => {
        const hit =
          createdDocs.find((cd) => String(cd.fileName || cd.name || "") === m.filename) ||
          createdDocs[sentMeta.indexOf(m)];
        return {
          path: m.path,
          filename: m.filename,
          document_id: hit?.documentId || hit?.id || null,
          flattened: m.flattened,
        };
      });
      const synInfo = {
        package_id: synPackageId,
        docs: docMap,
        signers,
        state: "draft",
        prepared_at: new Date().toISOString(),
      };
      // Multi-send (Tim, 2026-10-22): the offer goes out first, then a
      // Notice of Fulfillment / Waiver days later from the same package.
      // Every send is kept in deal.syngrafii_sends; deal.syngrafii
      // mirrors the latest. A signed package stays 'signed' when a
      // follow-on document goes out.
      const prevSends: any[] = Array.isArray(pkg.deal?.syngrafii_sends)
        ? pkg.deal.syngrafii_sends
        : pkg.deal?.syngrafii
          ? [pkg.deal.syngrafii]
          : [];
      const sends = [...prevSends, synInfo];
      const deal = { ...(pkg.deal || {}), syngrafii: synInfo, syngrafii_sends: sends };
      const { error: updErr } = await supabase
        .from("offer_packages")
        .update({ deal, status: pkg.status === "signed" ? "signed" : "out" })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      let editLink: string | null = null;
      let linkError: string | null = null;
      try {
        editLink = await synEditLink(synPackageId);
      } catch (e: any) {
        linkError = e?.message || "Edit link failed.";
      }
      return NextResponse.json({
        ok: true,
        syngrafii_package_id: synPackageId,
        edit_link: editLink,
        link_error: linkError,
        docs: docMap,
        sends,
      });
    }

    if (body.action === "signature_status") {
      const { data: pkg, error } = await supabase
        .from("offer_packages")
        .select("id,deal,documents,status")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!pkg) return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
      const deal0 = pkg.deal || {};
      const sends0: any[] = Array.isArray(deal0.syngrafii_sends)
        ? deal0.syngrafii_sends
        : deal0.syngrafii
          ? [deal0.syngrafii]
          : [];
      // A specific send can be checked by its iinked package id; the
      // default is the latest send.
      const targetId = String(body.syngrafii_package_id || "") || deal0.syngrafii?.package_id || "";
      const syn =
        sends0.find((s: any) => s?.package_id === targetId) ||
        (deal0.syngrafii?.package_id === targetId ? deal0.syngrafii : null);
      if (!syn?.package_id) {
        return NextResponse.json({ ok: false, error: "This package has not been sent to iinked." }, { status: 400 });
      }
      const status = await synPackageStatus(syn.package_id);
      const state = String(status?.state || "unknown");
      let filed: string[] = [];
      if (state === "executed") {
        const fresh = await supabase
          .from("offer_packages")
          .select("id,deal,documents,status")
          .eq("id", id)
          .maybeSingle();
        const res = await fileExecutedPackage(supabase, fresh.data || pkg, syn.package_id);
        filed = res.filed;
      } else if (state !== String(syn.state || "")) {
        // Keep the send's stored state honest between checks.
        const deal1: any = { ...deal0 };
        deal1.syngrafii_sends = sends0.map((s: any) =>
          s?.package_id === syn.package_id ? { ...s, state } : s
        );
        if (deal1.syngrafii?.package_id === syn.package_id) {
          deal1.syngrafii = { ...deal1.syngrafii, state };
        }
        await supabase.from("offer_packages").update({ deal: deal1 }).eq("id", id);
      }
      const { data: after } = await supabase
        .from("offer_packages")
        .select("documents,status,deal")
        .eq("id", id)
        .maybeSingle();
      return NextResponse.json({
        ok: true,
        state,
        filed,
        documents: after?.documents || pkg.documents,
        status: after?.status || pkg.status,
        sends: (after?.deal || {}).syngrafii_sends || sends0,
      });
    }

    if (body.action === "delete") {
      const { data: pkg } = await supabase
        .from("offer_packages")
        .select("id,documents")
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id)
        .maybeSingle();
      const paths = (Array.isArray(pkg?.documents) ? pkg.documents : [])
        .map((d: any) => d.path)
        .filter(Boolean);
      if (paths.length) {
        await supabase.storage.from(BUCKET).remove(paths);
      }
      const { error } = await supabase
        .from("offer_packages")
        .delete()
        .eq("account_id", FC_ACCOUNT_ID)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "Package action failed." },
      { status: 500 }
    );
  }
}

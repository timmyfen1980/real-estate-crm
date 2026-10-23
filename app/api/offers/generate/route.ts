/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/offers/generate — build editable offer PDFs (Form 100 / 801).
//
// Auth: a signed-in team member (session + account membership), or the
// agent Bearer secret (Rea testing/automation).
// Body: {
//   deal,                                  // engine-shaped deal JSON
//   forms?: ("100" | "801")[],             // default ["100"]
//   deal.standard_codes?: string[],        // which Standard Offer Clauses to include (default: all seven)
//   clauseCodes?: string[],                // optional library codes, e.g. ["J","K","T"]
//   clauseBlanks?: { [code]: { [blank]: string | string[] } }
// }
// Returns { ok, files: [{ form, filename, pages, base64 }] } or
// { ok: false, missing: [...] } when the deal or clause blanks are
// incomplete — the caller asks for exactly those, engine-style.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import {
  buildForm100,
  buildForm801,
  buildForm320,
  buildForm324,
  buildForm123,
  buildForm124,
  buildForm120,
  buildForm161,
  buildForm371,
  buildForm372,
  buildForm271,
  buildForm272,
  validateDeal,
  validate801,
  validate320,
  validateNotice,
  validateAmendment,
  validateDisclosure,
  validateRep,
  validateListing,
} from "@/lib/offerPdf";
import library from "@/lib/clauseLibrary.json";

const FC_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";
const BUCKET = "client-documents";
const DIR = "system/offer-templates";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function authorized(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
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

async function loadTemplate(
  name: "form100" | "form801" | "form320" | "form324" | "form123" | "form124" | "form120" | "form161" | "form371" | "form372" | "form271" | "form272"
): Promise<Uint8Array | null> {
  const { data, error } = await serviceClient()
    .storage.from(BUCKET)
    .download(`${DIR}/${name}.pdf`);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

interface ChosenClause {
  label: string;
  code: string;
  text: string;
}

function resolveClauses(
  deal: any,
  standardCodes: string[] | null,
  clauseCodes: string[],
  clauseBlanks: Record<string, Record<string, string | string[]>>
): { paragraphs: string[]; missing: string[] } {
  const missing: string[] = [];
  const chosen: ChosenClause[] = [];
  // Standard clauses: null = all seven (the default — they come
  // preselected in every offer); an array = only those keys, so the
  // workspace can leave one out of a single offer (Tim, 2026-10-21).
  for (const s of (library as any).standards as any[]) {
    const key = s.code || s.id;
    if (standardCodes && !standardCodes.includes(key)) continue;
    chosen.push({ label: `Standard clause ${key} (${s.title})`, code: key, text: s.text });
  }
  for (const code of clauseCodes) {
    const opt = ((library as any).options as any[]).find((o) => o.code === code);
    if (!opt) missing.push(`clause code "${code}" is not in the library`);
    else chosen.push({ label: `Clause ${code} (${opt.title})`, code, text: opt.text });
  }

  const paragraphs: string[] = [];
  for (const c of chosen) {
    let t = c.text;
    // Condition deadlines (Tim, 2026-10-21): the financing and
    // inspection standards bake in "6:00 p.m." and "the fifth banking
    // day" — when the workspace answers differ, the clause text is
    // edited to match the answers so Schedule A stays accurate.
    if (c.code === "B" || c.code === "C") {
      const terms =
        (deal.condition_terms || {})[c.code === "B" ? "financing" : "inspection"] || {};
      const ORDINALS = [
        "",
        "first",
        "second",
        "third",
        "fourth",
        "fifth",
        "sixth",
        "seventh",
        "eighth",
        "ninth",
        "tenth",
      ];
      const days = parseInt(String(terms.days ?? ""), 10);
      if (days >= 1 && days <= 10 && days !== 5) {
        t = t.split("fifth banking day").join(`${ORDINALS[days]} banking day`);
      }
      const time = String(terms.time || "").trim();
      if (time && time !== "6:00 p.m.") {
        t = t.split("6:00 p.m.").join(time);
      }
    }
    const blanks = clauseBlanks[c.code] || {};
    t = t.split("INSERT NAME").join(deal.inspector_name || "");
    t = t.split("INSERT DATE").join(deal.inspection_deadline || "");
    t = t.replace(/INSERT [A-Z][A-Z /]+/g, (m) => {
      const v = blanks[m];
      return typeof v === "string" ? v : m;
    });
    if (Array.isArray(blanks["____"])) {
      const vals = [...(blanks["____"] as string[])];
      t = t.replace(/____/g, () => (vals.length ? vals.shift()! : "____"));
    } else if (typeof blanks["____"] === "string") {
      t = t.split("____").join(blanks["____"] as string);
    }
    const money = blanks["XXXXXX"];
    if (typeof money === "string") t = t.split("$XXXXXX").join(money).split("XXXXXX").join(money);

    if (/INSERT [A-Z]/.test(t)) missing.push(`${c.label}: an INSERT blank is unfilled`);
    if (t.includes("____")) missing.push(`${c.label}: a ____ blank is unfilled`);
    if (t.includes("XXXXXX")) missing.push(`${c.label}: a $XXXXXX amount is unfilled`);
    if (t.includes("<<") || t.includes(">>")) missing.push(`${c.label}: unresolved << >> marker`);
    paragraphs.push(t);
  }
  return { paragraphs, missing };
}

// Body text for the Form 124 (Notice of Fulfillment) and Form 123
// (Waiver): quote the condition clauses the buyer is fulfilling or
// waiving — the same wording Schedule A carries, including the
// workspace's condition-term edits — then any extra text verbatim.
function noticeParagraphs(
  deal: any,
  key: "fulfillment" | "waiver",
  clauseBlanks: Record<string, Record<string, string | string[]>>
): string[] {
  const n = deal?.[key] || {};
  const codes: string[] = Array.isArray(n.conditions) ? n.conditions.map(String) : [];
  const ORDINALS = [
    "",
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
  ];
  const paragraphs: string[] = [];
  for (const code of codes) {
    const std = ((library as any).standards as any[]).find(
      (s) => (s.code || s.id) === code
    );
    if (!std) continue;
    let t = String(std.text);
    if (code === "B" || code === "C") {
      const terms =
        (deal.condition_terms || {})[code === "B" ? "financing" : "inspection"] || {};
      const days = parseInt(String(terms.days ?? ""), 10);
      if (days >= 1 && days <= 10 && days !== 5) {
        t = t.split("fifth banking day").join(`${ORDINALS[days]} banking day`);
      }
      const time = String(terms.time || "").trim();
      if (time && time !== "6:00 p.m.") {
        t = t.split("6:00 p.m.").join(time);
      }
    }
    t = t.split("INSERT NAME").join(deal.inspector_name || "");
    t = t.split("INSERT DATE").join(deal.inspection_deadline || "");
    const blanks = clauseBlanks[code] || {};
    t = t.replace(/INSERT [A-Z][A-Z /]+/g, (m) =>
      typeof blanks[m] === "string" ? (blanks[m] as string) : m
    );
    paragraphs.push(t);
  }
  const extra = typeof n.extra_text === "string" ? n.extra_text.trim() : "";
  if (extra) {
    paragraphs.push(
      ...extra
        .split(/\n{2,}/)
        .map((s: string) => s.trim())
        .filter(Boolean)
    );
  }
  return paragraphs;
}

// Fill the structural pieces a partial deal may lack so the PDF builder
// can run with blanks instead of crashing.
function normalizePartial(deal: any): any {
  const d = { ...deal };
  const blankDate = { day: "", month: "", year: "" };
  if (!d.agreement_date) d.agreement_date = { ...blankDate };
  if (!d.irrevocable) d.irrevocable = { by: "", time: "", date: { ...blankDate } };
  else if (!d.irrevocable.date) d.irrevocable = { ...d.irrevocable, date: { ...blankDate } };
  if (!d.completion_date) d.completion_date = { ...blankDate };
  if (!d.title_search_date) d.title_search_date = { ...blankDate };
  if (!d.property) d.property = {};
  if (!d.buyers) d.buyers = [];
  if (!d.sellers) d.sellers = [];
  if (!d.chattels) d.chattels = [];
  if (!d.exclusions) d.exclusions = [];
  if (!d.selling_brokerage)
    d.selling_brokerage = { brokerage: "", agent: "", phone: "" };
  if (!d.listing_brokerage)
    d.listing_brokerage = { brokerage: "", agent: "", phone: "" };
  if (!d.submitted) d.submitted = { via: "", time: "", date: { ...blankDate } };
  else if (!d.submitted.date) d.submitted = { ...d.submitted, date: { ...blankDate } };
  return d;
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

// Save the generated forms as an offer package (Offers tab). The files
// land in the client-documents bucket under offers/<package-id>/ and the
// package row lists them, so later forms can join the same package.
async function savePackage(
  req: NextRequest,
  deal: any,
  files: any[],
  partial: boolean
): Promise<string> {
  const supabase = serviceClient();
  const userId = await resolveUserId(req);
  const prop = deal.property || {};
  const { data: pkg, error } = await supabase
    .from("offer_packages")
    .insert({
      account_id: FC_ACCOUNT_ID,
      created_by: userId,
      address: prop.address || "Untitled offer",
      city: prop.city || null,
      mls: prop.mls || null,
      status: "draft",
      partial,
      deal,
      documents: [],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const docs: any[] = [];
  for (const f of files) {
    const path = `offers/${pkg.id}/${f.filename}`;
    const bytes = Buffer.from(f.base64, "base64");
    const { error: upErr } = await supabase.storage
      .from("client-documents")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);
    docs.push({
      form: f.form,
      filename: f.filename,
      path,
      signed: false,
      added_at: new Date().toISOString(),
    });
  }
  const { error: updErr } = await supabase
    .from("offer_packages")
    .update({ documents: docs })
    .eq("id", pkg.id);
  if (updErr) throw new Error(updErr.message);
  return pkg.id;
}

// Save generated forms into an EXISTING package (the workspace page):
// files replace any earlier copy of the same form; the deal snapshot is
// refreshed so the package always holds the latest answers.
async function saveIntoPackage(
  packageId: string,
  deal: any,
  files: any[],
  partial: boolean
): Promise<string> {
  const supabase = serviceClient();
  const { data: pkg, error } = await supabase
    .from("offer_packages")
    .select("id,documents")
    .eq("account_id", FC_ACCOUNT_ID)
    .eq("id", packageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pkg) throw new Error("Package not found.");
  let docs: any[] = Array.isArray(pkg.documents) ? [...pkg.documents] : [];
  for (const f of files) {
    const path = `offers/${packageId}/${f.filename}`;
    const bytes = Buffer.from(f.base64, "base64");
    const { error: upErr } = await supabase.storage
      .from("client-documents")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);
    docs = docs.filter((d: any) => d.form !== f.form);
    docs.push({
      form: f.form,
      filename: f.filename,
      path,
      signed: false,
      added_at: new Date().toISOString(),
    });
  }
  const { error: updErr } = await supabase
    .from("offer_packages")
    .update({ documents: docs, deal, partial })
    .eq("id", packageId);
  if (updErr) throw new Error(updErr.message);
  return packageId;
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as any;
    let deal = body.deal;
    if (!deal || typeof deal !== "object") {
      return NextResponse.json({ ok: false, error: "Need a deal object." }, { status: 400 });
    }
    const forms: string[] = Array.isArray(body.forms) && body.forms.length ? body.forms : ["100"];

    const missing: string[] = [];
    if (forms.includes("100")) missing.push(...validateDeal(deal));
    if (forms.includes("801")) missing.push(...validate801(deal));
    if (forms.includes("320")) missing.push(...validate320(deal));
    if (forms.includes("324")) missing.push(...validate320(deal));
    if (forms.includes("124")) missing.push(...validateNotice(deal, "fulfillment"));
    if (forms.includes("123")) missing.push(...validateNotice(deal, "waiver"));
    if (forms.includes("120")) missing.push(...validateAmendment(deal));
    if (forms.includes("161")) missing.push(...validateDisclosure(deal));
    if (forms.includes("371")) missing.push(...validateRep(deal, "371"));
    if (forms.includes("372")) missing.push(...validateRep(deal, "372"));
    if (forms.includes("271")) missing.push(...validateListing(deal, "271"));
    if (forms.includes("272")) missing.push(...validateListing(deal, "272"));

    let paragraphs: string[] = [];
    if (forms.includes("100")) {
      const resolved = resolveClauses(
        deal,
        Array.isArray(deal.standard_codes)
          ? deal.standard_codes.map(String)
          : body.includeStandards === false
            ? []
            : null,
        Array.isArray(body.clauseCodes) ? body.clauseCodes : [],
        body.clauseBlanks || {}
      );
      paragraphs = resolved.paragraphs;
      missing.push(...resolved.missing);
    }
    // "Generate what we have" (Tim, 2026-10-21): with allow_partial the
    // agent can download a draft with fields still missing — the blanks
    // simply stay blank on the editable PDF.
    const partial = body.allow_partial === true;
    if (missing.length > 0 && !partial) {
      return NextResponse.json({ ok: false, missing }, { status: 400 });
    }
    if (partial) deal = normalizePartial(deal);

    const files: any[] = [];
    const addr = String(deal.property?.address || "offer").replace(/[^\w\- ]+/g, "").trim();
    if (forms.includes("100")) {
      const tpl = await loadTemplate("form100");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 100 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm100(deal, paragraphs, tpl);
      files.push({
        form: "100",
        filename: `Form 100 - ${addr}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("801")) {
      const tpl = await loadTemplate("form801");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 801 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm801(deal, tpl);
      files.push({
        form: "801",
        filename: `Form 801 - ${addr}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("320")) {
      const tpl = await loadTemplate("form320");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 320 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm320(deal, tpl);
      files.push({
        form: "320",
        filename: `Form 320 - ${addr}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("324")) {
      const tpl = await loadTemplate("form324");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 324 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm324(deal, tpl);
      files.push({
        form: "324",
        filename: `Form 324 - ${addr}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("124")) {
      const tpl = await loadTemplate("form124");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 124 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm124(
        deal,
        noticeParagraphs(deal, "fulfillment", body.clauseBlanks || {}),
        tpl
      );
      files.push({
        form: "124",
        filename: `Form 124 - ${addr}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("123")) {
      const tpl = await loadTemplate("form123");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 123 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm123(
        deal,
        noticeParagraphs(deal, "waiver", body.clauseBlanks || {}),
        tpl
      );
      files.push({
        form: "123",
        filename: `Form 123 - ${addr}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("120")) {
      const tpl = await loadTemplate("form120");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 120 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm120(deal, tpl);
      files.push({
        form: "120",
        filename: `Form 120 - ${addr}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("161")) {
      const tpl = await loadTemplate("form161");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 161 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm161(deal, tpl);
      files.push({
        form: "161",
        filename: `Form 161 - ${addr}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("371")) {
      const tpl = await loadTemplate("form371");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 371 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm371(deal, tpl);
      const clientName = String((deal.rep?.clients || []).filter(Boolean)[0] || addr).replace(/[^\w\- ]+/g, "").trim();
      files.push({
        form: "371",
        filename: `Form 371 - ${clientName}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("372")) {
      const tpl = await loadTemplate("form372");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 372 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm372(deal, tpl);
      const clientName = String((deal.rep?.clients || []).filter(Boolean)[0] || addr).replace(/[^\w\- ]+/g, "").trim();
      files.push({
        form: "372",
        filename: `Form 372 - ${clientName}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("271")) {
      const tpl = await loadTemplate("form271");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 271 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm271(deal, tpl);
      const clientName = String((deal.listing?.clients || []).filter(Boolean)[0] || addr).replace(/[^\w\- ]+/g, "").trim();
      files.push({
        form: "271",
        filename: `Form 271 - ${clientName}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    if (forms.includes("272")) {
      const tpl = await loadTemplate("form272");
      if (!tpl) {
        return NextResponse.json(
          { ok: false, code: "templates_missing", error: "The Form 272 blank is not in storage yet." },
          { status: 503 }
        );
      }
      const { bytes, pages } = await buildForm272(deal, tpl);
      const clientName = String((deal.listing?.clients || []).filter(Boolean)[0] || addr).replace(/[^\w\- ]+/g, "").trim();
      files.push({
        form: "272",
        filename: `Form 272 - ${clientName}.pdf`,
        pages,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
    // Save as an offer package for the Offers tab (best-effort: a save
    // failure — e.g. the table not created yet — never blocks the PDFs).
    let packageId: string | null = null;
    let packageError: string | null = null;
    if (body.save_package !== false) {
      try {
        const snapshot = {
          ...deal,
          clause_codes: Array.isArray(body.clauseCodes) ? body.clauseCodes : [],
          clause_blanks: body.clauseBlanks || {},
        };
        packageId = body.package_id
          ? await saveIntoPackage(String(body.package_id), snapshot, files, partial)
          : await savePackage(req, snapshot, files, partial);
      } catch (e: any) {
        packageError = e?.message || "Package save failed.";
      }
    }
    return NextResponse.json({
      ok: true,
      files,
      partial: partial || undefined,
      missing: partial ? missing : undefined,
      package_id: packageId,
      package_error: packageError,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "Generation failed." },
      { status: 500 }
    );
  }
}

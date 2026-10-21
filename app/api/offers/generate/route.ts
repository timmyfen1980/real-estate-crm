/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/offers/generate — build editable offer PDFs (Form 100 / 801).
//
// Auth: a signed-in team member (session + account membership), or the
// agent Bearer secret (Rea testing/automation).
// Body: {
//   deal,                                  // engine-shaped deal JSON
//   forms?: ("100" | "801")[],             // default ["100"]
//   includeStandards?: boolean,           // default true (Standard Offer Clauses)
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
import { buildForm100, buildForm801, validateDeal, validate801 } from "@/lib/offerPdf";
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

async function loadTemplate(name: "form100" | "form801"): Promise<Uint8Array | null> {
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
  includeStandards: boolean,
  clauseCodes: string[],
  clauseBlanks: Record<string, Record<string, string | string[]>>
): { paragraphs: string[]; missing: string[] } {
  const missing: string[] = [];
  const chosen: ChosenClause[] = [];
  if (includeStandards) {
    for (const s of (library as any).standards as any[]) {
      chosen.push({ label: `Standard clause ${s.code || s.id} (${s.title})`, code: s.code || s.id, text: s.text });
    }
  }
  for (const code of clauseCodes) {
    const opt = ((library as any).options as any[]).find((o) => o.code === code);
    if (!opt) missing.push(`clause code "${code}" is not in the library`);
    else chosen.push({ label: `Clause ${code} (${opt.title})`, code, text: opt.text });
  }

  const paragraphs: string[] = [];
  for (const c of chosen) {
    let t = c.text;
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

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as any;
    const deal = body.deal;
    if (!deal || typeof deal !== "object") {
      return NextResponse.json({ ok: false, error: "Need a deal object." }, { status: 400 });
    }
    const forms: string[] = Array.isArray(body.forms) && body.forms.length ? body.forms : ["100"];

    const missing: string[] = [];
    if (forms.includes("100")) missing.push(...validateDeal(deal));
    if (forms.includes("801")) missing.push(...validate801(deal));

    let paragraphs: string[] = [];
    if (forms.includes("100")) {
      const resolved = resolveClauses(
        deal,
        body.includeStandards !== false,
        Array.isArray(body.clauseCodes) ? body.clauseCodes : [],
        body.clauseBlanks || {}
      );
      paragraphs = resolved.paragraphs;
      missing.push(...resolved.missing);
    }
    if (missing.length > 0) {
      return NextResponse.json({ ok: false, missing }, { status: 400 });
    }

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
    return NextResponse.json({ ok: true, files });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "Generation failed." },
      { status: 500 }
    );
  }
}

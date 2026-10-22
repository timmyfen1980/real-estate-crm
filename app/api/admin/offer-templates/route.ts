// /api/admin/offer-templates — agent-side management of the blank OREA
// templates the offer generator fills. Auth: Bearer REA_AGENT_SECRET.
// Templates live in the private client-documents bucket under
// system/offer-templates/ (form100.pdf, form801.pdf) and are only ever
// read server-side by /api/offers/generate.
//
// POST multipart { name: 'form100'|'form801', file }  -> upload/replace
// GET                                                  -> which are present

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "client-documents";
const DIR = "system/offer-templates";
const NAMES = ["form100", "form801", "form320", "form324", "form124", "form123", "form120"] as const;

function unauthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
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
  const { data, error } = await supabase.storage.from(BUCKET).list(DIR);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }
  const present = new Set((data || []).map((f) => f.name));
  const templates: Record<string, boolean> = {};
  for (const n of NAMES) templates[n] = present.has(`${n}.pdf`);
  return NextResponse.json({ ok: true, templates });
}

export async function POST(req: NextRequest) {
  if (unauthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const form = await req.formData();
  const name = String(form.get("name") || "");
  const file = form.get("file");
  if (!(NAMES as readonly string[]).includes(name) || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Need name (form100|form801|form320|form324|form124|form123|form120) and a PDF file." },
      { status: 400 }
    );
  }
  const supabase = serviceClient();
  const path = `${DIR}/${name}.pdf`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: "application/pdf" });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, path, size: file.size });
}

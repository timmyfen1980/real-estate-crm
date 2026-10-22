/* eslint-disable @typescript-eslint/no-explicit-any */
// iinked Sign webhook receiver. iinked calls this when a package event
// fires; on "package_executed" the signed PDFs + audit certificates are
// downloaded and filed back into the CRM offer package automatically.
//
// Verification (per Syngrafii's docs): the X-Syngrafii-Signature header
// carries base64(HMAC-SHA256(endpoint URL + raw JSON body, secret)),
// where the secret is the one issued when the endpoint was registered
// (kept server-side in storage — see synReadSettings). The raw body is
// verified BEFORE parsing, and the URL must match exactly.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import {
  synReadSettings,
  fileExecutedPackage,
  SYN_WEBHOOK_URL,
} from "@/lib/syngrafii";

const FC_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function signatureOk(secret: string, rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret)
    .update(SYN_WEBHOOK_URL + rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const supabase = serviceClient();
  const settings = await synReadSettings(supabase);
  if (!settings?.secret) {
    // Not registered yet — fail loudly so the misconfiguration is
    // visible rather than silently dropping events.
    return NextResponse.json({ ok: false, error: "Webhook not configured." }, { status: 500 });
  }
  if (!signatureOk(settings.secret, rawBody, req.headers.get("x-syngrafii-signature"))) {
    return NextResponse.json({ ok: false, error: "Bad signature." }, { status: 401 });
  }
  let event: any = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON." }, { status: 400 });
  }
  const action = String(event?.action || "");
  const packageId = String(event?.packageId || "");
  if (action !== "package_executed" || !packageId) {
    return NextResponse.json({ ok: true, ignored: action || "unknown" });
  }
  try {
    const { data: rows, error } = await supabase
      .from("offer_packages")
      .select("id,deal,documents,status")
      .eq("account_id", FC_ACCOUNT_ID)
      .eq("status", "out");
    if (error) throw new Error(error.message);
    const pkg = (rows || []).find(
      (r: any) => (r.deal || {}).syngrafii?.package_id === packageId
    );
    if (!pkg) {
      return NextResponse.json({ ok: true, ignored: "untracked package" });
    }
    const res = await fileExecutedPackage(supabase, pkg);
    return NextResponse.json({ ok: true, filed: res.filed });
  } catch (e: any) {
    // 500 so iinked retries — filing is idempotent.
    return NextResponse.json(
      { ok: false, error: e?.message || "Filing failed." },
      { status: 500 }
    );
  }
}

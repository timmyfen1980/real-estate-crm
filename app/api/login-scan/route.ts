/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/login-scan — login-triggered catch-up scans (checklist #2).
// Auth: signed-in team member (session cookie). The dashboard layout
// mounts <LoginScan/>, which POSTs here once per browser session; the
// route itself enforces a per-user 30-minute cooldown, so repeat
// logins and stray double-fires are cheap no-ops.
//
// What a scan does:
//   1. Lead/task sync — server-to-server POST /api/admin/task-engine
//      { action: "sync" } with the agent Bearer secret (the same call
//      pattern the rea-chat route uses for /api/offers/prefill), so
//      closing-milestone tasks are fresh the moment someone logs in.
//   2. Email follow-ups (v1, connected-mail users only) — the
//      email_followups rows are produced by the external hourly inbox
//      scanner, which POSTs them to /api/admin/email-followups;
//      nothing inside the CRM can read a mailbox (the per-user
//      Microsoft connection stores tokens, but no Graph mail read
//      exists in-CRM yet). So for a user whose Microsoft mailbox is
//      connected, this step makes the minimal call into that same
//      existing endpoint — a Bearer GET reading the current
//      open/dismissed state — and reports the open count. It never
//      fabricates a sync that did not happen.
//
// Cooldown state: storage JSON system/login-scans.json in the
// client-documents bucket (same home and read/write pattern as
// system/lawyer-directory.json in /api/offers/packages), shaped
// { "<user_id>": "<last scan ISO>" }.
//
// Cooldown-on-failure decision: the timestamp is recorded ONLY when
// the lead/task sync succeeded. If it failed, nothing is recorded, so
// the next login retries right away instead of the user being locked
// out for 30 minutes by a transient failure. (The email section never
// gates the recording — v1 is read-only.)
//
// Failure posture: every section is wrapped independently and reported
// per-section; one section failing never fails the route. The client
// ignores the response entirely — there is no UI for this.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "client-documents";
const SCAN_STATE_PATH = "system/login-scans.json";
const COOLDOWN_MS = 30 * 60 * 1000;

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Pure cooldown decision (dependency-free, so it can be unit-tested
// outside the route): skip when the last recorded scan is younger than
// the cooldown window. Missing/unparseable timestamps never skip.
function isOnCooldown(lastScanIso: unknown, nowMs: number): boolean {
  if (typeof lastScanIso !== "string" || !lastScanIso) return false;
  const last = Date.parse(lastScanIso);
  if (Number.isNaN(last)) return false;
  return nowMs - last < COOLDOWN_MS;
}

type ScanState = Record<string, string>;

async function readScanState(supabase: SupabaseClient): Promise<ScanState> {
  const { data, error } = await supabase.storage.from(BUCKET).download(SCAN_STATE_PATH);
  if (error || !data) return {};
  try {
    const parsed = JSON.parse(await data.text());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeScanState(supabase: SupabaseClient, state: ScanState): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(state, null, 2));
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(SCAN_STATE_PATH, bytes, { contentType: "application/json", upsert: true });
  if (error) throw new Error(error.message);
}

export async function POST(req: NextRequest) {
  // Session auth — the same createServerClient pattern as
  // /api/microsoft/status and /api/offers/packages.
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
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const supabase = serviceClient();
  const nowMs = Date.now();

  // Cooldown gate — fail-open: an unreadable state file reads as "no
  // recorded scan" and the scan runs; a fresh scan is harmless.
  let state: ScanState = {};
  try {
    state = await readScanState(supabase);
  } catch {
    state = {};
  }
  if (isOnCooldown(state[user.id], nowMs)) {
    return NextResponse.json({ ok: true, skipped: "cooldown" });
  }

  const origin = new URL(req.url).origin;
  const agentHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.REA_AGENT_SECRET || ""}`,
  };

  // Section 1: lead/task sync via the existing task engine.
  let leadSync: any = { status: "error" };
  try {
    const res = await fetch(`${origin}/api/admin/task-engine`, {
      method: "POST",
      headers: agentHeaders,
      body: JSON.stringify({ action: "sync" }),
    });
    const data: any = await res.json().catch(() => null);
    leadSync = res.ok
      ? { status: "ok", ...(data && typeof data === "object" ? data : {}) }
      : { status: "error", http_status: res.status, error: data?.error || "Sync failed." };
  } catch (err: any) {
    leadSync = { status: "error", error: err?.message || "Sync request failed." };
  }

  // Section 2: email follow-ups — connected-mail users only. The
  // connection check mirrors /api/microsoft/status exactly.
  let emailFollowups: any = "not_connected";
  try {
    const { data: conn } = await supabase
      .from("user_mail_connections")
      .select("status")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .maybeSingle();
    if (conn && conn.status === "connected") {
      const res = await fetch(`${origin}/api/admin/email-followups`, {
        method: "GET",
        headers: agentHeaders,
      });
      const data: any = await res.json().catch(() => null);
      emailFollowups = res.ok
        ? {
            status: "ok",
            connected: true,
            open: Array.isArray(data?.open) ? data.open.length : 0,
          }
        : { status: "error", connected: true, http_status: res.status };
    }
  } catch (err: any) {
    emailFollowups = { status: "error", error: err?.message || "Follow-ups check failed." };
  }

  // Record the scan time only after the work has run AND the lead/task
  // sync succeeded (see the header note). A failed write is swallowed:
  // worst case, the next login scans again a little early.
  if (leadSync.status === "ok") {
    try {
      state[user.id] = new Date(nowMs).toISOString();
      await writeScanState(supabase, state);
    } catch {
      // Non-fatal — see comment above.
    }
  }

  return NextResponse.json({
    ok: true,
    lead_sync: leadSync,
    email_followups: emailFollowups,
  });
}

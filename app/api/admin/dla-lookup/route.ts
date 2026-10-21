// POST /api/admin/dla-lookup — agent-side PropTx DLA listing lookup.
// Auth: Bearer REA_AGENT_SECRET header.
// Body: { key: "E14083510" }  (an MLS® ListingKey)
// Returns the full DLA Property record for the key so Rea's offer desk can
// prefill offer paperwork (legal description, chattels, exclusions, lot,
// taxes, property attributes). DLA data is back-office only: this route is
// secret-gated and the data is never rendered on any public page.
// The DLA token lives in the PROPTX_DLA_TOKEN env var (Vercel, CRM project).

import { NextRequest, NextResponse } from "next/server";

const DLA_BASE = "https://query.ampre.ca/odata";

function unauthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  return !token || token !== process.env.REA_AGENT_SECRET;
}

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

export async function POST(req: NextRequest) {
  try {
    if (unauthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { key?: string };
    const key = (body.key || "").trim();
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "Need a listing key (MLS® number)." },
        { status: 400 }
      );
    }

    const token = process.env.PROPTX_DLA_TOKEN;
    if (!token) {
      return NextResponse.json(
        { ok: false, code: "not_configured", error: "DLA token is not configured." },
        { status: 503 }
      );
    }

    const filter = encodeURIComponent(`ListingKey eq '${esc(key)}'`);
    const url = `${DLA_BASE}/Property?$filter=${filter}&$top=1`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch {
      return NextResponse.json(
        { ok: false, code: "network", error: "Could not reach the DLA feed." },
        { status: 502 }
      );
    }

    const text = await res.text();
    const trimmed = text.trimStart();
    if (trimmed.startsWith("<")) {
      // HTML means a Cloudflare block page, not an API answer.
      return NextResponse.json(
        { ok: false, code: "blocked", error: "The DLA feed blocked this request." },
        { status: 502 }
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, code: "bad_response", error: "The DLA feed returned an unreadable response." },
        { status: 502 }
      );
    }

    if (!res.ok) {
      const code = res.status === 401 || res.status === 403 ? "unauthorized" : `http_${res.status}`;
      return NextResponse.json(
        { ok: false, code, error: "The DLA feed rejected this request." },
        { status: 502 }
      );
    }

    const rows = (data as { value?: Record<string, unknown>[] }).value ?? [];
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, code: "not_found", error: `No DLA listing found for ${key}.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, source: "DLA", listing: rows[0] });
  } catch {
    return NextResponse.json(
      { ok: false, code: "server_error", error: "DLA lookup failed." },
      { status: 500 }
    );
  }
}

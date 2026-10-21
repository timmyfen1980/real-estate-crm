/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/offers/listing-extract — read an uploaded MLS listing sheet
// (PDF or photo/screenshot, e.g. a REALM printout) and return the offer
// fields found on it. The workspace fills only fields that are still
// blank — a sheet never overwrites what the agent already entered.
// Auth: signed-in team member (session + account membership) or the
// agent Bearer secret.
// Multipart body: { file } -> { ok, fields: {...} }

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

const PROMPT = `You are reading an Ontario MLS listing sheet (REALM/Matrix style printout). Extract whatever is printed and return ONLY a JSON object with these keys (omit any key you cannot find — never guess):
{
  "seller_names": [string] — legal names of the sellers/owners exactly as printed, if shown,
  "legal_description": string,
  "pin": string,
  "frontage": number or string — lot frontage measurement only,
  "frontage_unit": "feet" or "metres" — the unit shown for the frontage,
  "depth": number or string,
  "depth_unit": "feet" or "metres",
  "street_side": string — if the sheet states which side of the street the property fronts on (e.g. "south"),
  "list_price": number,
  "taxes": number — annual taxes,
  "chattels_inclusions": string — inclusions/chattels text as printed,
  "exclusions": string,
  "listing_brokerage": string,
  "listing_agent": string — the listing salesperson's name if printed,
  "listing_phone": string — the listing agent's or brokerage's phone number if printed,
  "listing_email": string — the listing agent's email address if printed
}
Return the JSON object only, no other text.`;

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    // The CRM project's key was entered as OPEN_PI_KEY — accept both names.
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_PI_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Listing-sheet reading isn't switched on yet (no API key)." },
        { status: 503 }
      );
    }
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided." }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "That file is over 12 MB — try a smaller export or a photo of the sheet." },
        { status: 400 }
      );
    }
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mime = file.type || "";
    const isPdf = mime.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");

    const content: any[] = [{ type: "text", text: PROMPT }];
    if (isPdf) {
      content.push({
        type: "file",
        file: {
          filename: file.name || "listing.pdf",
          file_data: `data:application/pdf;base64,${base64}`,
        },
      });
    } else {
      content.push({
        type: "image_url",
        image_url: { url: `data:${mime || "image/jpeg"};base64,${base64}`, detail: "high" },
      });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "I couldn't read that file. A clear photo or screenshot of the sheet usually works best.",
        },
        { status: 502 }
      );
    }
    const data: any = await res.json();
    const text = data?.choices?.[0]?.message?.content || "{}";
    let fields: any = {};
    try {
      fields = JSON.parse(text);
    } catch {
      fields = {};
    }
    return NextResponse.json({ ok: true, fields });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "Extract failed." },
      { status: 500 }
    );
  }
}

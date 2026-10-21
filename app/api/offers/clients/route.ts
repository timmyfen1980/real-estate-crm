/* eslint-disable @typescript-eslint/no-explicit-any */
// GET /api/offers/clients?q=<name> — client picker for the offer
// workspace start screen. Searches CRM contacts and joins their portal
// client file (if any), so a package can link to the client who most
// likely already signed a representation agreement.
// Auth: signed-in team member (session + account membership) or the
// agent Bearer secret.

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

export async function GET(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ ok: true, clients: [] });
    const supabase = serviceClient();
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const { data: contacts, error } = await supabase
      .from("contacts")
      .select("id,first_name,last_name,email,phone")
      .eq("account_id", FC_ACCOUNT_ID)
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
      .limit(10);
    if (error) throw new Error(error.message);
    const ids = (contacts || []).map((c: any) => c.id);
    const filesByContact: Record<string, any> = {};
    if (ids.length) {
      const { data: files } = await supabase
        .from("client_files")
        .select("id,crm_contact_id,checklist_types,portal_token")
        .in("crm_contact_id", ids);
      for (const f of files || []) filesByContact[f.crm_contact_id] = f;
    }
    const clients = (contacts || []).map((c: any) => {
      const f = filesByContact[c.id];
      return {
        contact_id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "Unknown",
        email: c.email || null,
        phone: c.phone || null,
        client_file_id: f?.id || null,
        checklist_types: f?.checklist_types || [],
      };
    });
    return NextResponse.json({ ok: true, clients });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "Client search failed." },
      { status: 500 }
    );
  }
}

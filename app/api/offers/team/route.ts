/* eslint-disable @typescript-eslint/no-explicit-any */
// Team directory for the offer workspace — names + phone numbers live
// on each person's profile (the Account page edits profiles.phone);
// this route lets the workspace pickers read them from that one place
// instead of a hardcoded list, and lets Rea seed a number once.
// Auth: signed-in FC Group member (session) or the agent Bearer secret.
//   GET                        -> { ok, team: [{ user_id, name, phone, role }] }
//   POST { user_id, phone }    -> set that member's profile phone

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

async function teamMembers() {
  const supabase = serviceClient();
  const { data: members, error } = await supabase
    .from("account_users")
    .select("user_id, role")
    .eq("account_id", FC_ACCOUNT_ID);
  if (error) throw new Error(error.message);
  const ids = (members || []).map((m: any) => m.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .in("id", ids);
  const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
  return (members || []).map((m: any) => ({
    user_id: m.user_id,
    role: m.role,
    name: byId.get(m.user_id)?.full_name || "",
    phone: byId.get(m.user_id)?.phone || "",
  }));
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
    }
    return NextResponse.json({ ok: true, team: await teamMembers() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Team lookup failed." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
    }
    const body = await req.json();
    const userId = String(body.user_id || "");
    const phone = String(body.phone || "").trim();
    if (!userId || !phone) {
      return NextResponse.json({ ok: false, error: "Need user_id and phone." }, { status: 400 });
    }
    const team = await teamMembers();
    if (!team.some((t) => t.user_id === userId)) {
      return NextResponse.json({ ok: false, error: "That user is not on this team." }, { status: 400 });
    }
    const { error } = await serviceClient().from("profiles").update({ phone }).eq("id", userId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, team: await teamMembers() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Could not save the phone number." }, { status: 500 });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/rea-chat — the in-CRM Rea assistant (bottom-right chat).
// Auth: signed-in team member (session + account membership), or the
// agent Bearer secret (acts as the account owner, for testing).
// Body: { messages: [{ role: 'user'|'assistant', content }] }
// Returns: { ok, reply, links?: [{ label, href }] }
//
// Rea answers from live CRM data via tools — never from memory alone:
//   get_my_tasks, get_leads_needing_attention, get_closings_ahead,
//   search_listings, start_offer (hands off to the offer workspace).
// She drafts and points; she never sends email or changes records here.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const FC_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";
const MODEL = "gpt-4o-mini";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function torontoToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

async function resolveMember(
  req: NextRequest
): Promise<{ userId: string; name: string } | null> {
  const supabase = serviceClient();
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (token && token === process.env.REA_AGENT_SECRET) {
    const { data: owner } = await supabase
      .from("account_users")
      .select("user_id")
      .eq("account_id", FC_ACCOUNT_ID)
      .eq("role", "owner")
      .maybeSingle();
    if (!owner) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", owner.user_id)
      .maybeSingle();
    return { userId: owner.user_id, name: profile?.full_name || "Tim" };
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
  if (!user) return null;
  const { data: member } = await supabase
    .from("account_users")
    .select("user_id")
    .eq("account_id", FC_ACCOUNT_ID)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  return { userId: user.id, name: profile?.full_name || "there" };
}

// ---------------------------------------------------------------------------
// tools
// ---------------------------------------------------------------------------

async function getMyTasks(userId: string) {
  const supabase = serviceClient();
  const today = torontoToday();
  const horizon = addDays(today, 3);
  const { data } = await supabase
    .from("tasks")
    .select("id,title,due_date,status,priority,lead_id")
    .eq("account_id", FC_ACCOUNT_ID)
    .eq("assigned_user_id", userId)
    .neq("status", "completed")
    .order("due_date", { ascending: true })
    .limit(60);
  const rows = data || [];
  const overdue = rows.filter((t: any) => t.due_date && t.due_date < today);
  const dueSoon = rows.filter(
    (t: any) => t.due_date && t.due_date >= today && t.due_date <= horizon
  );
  const upcoming = rows.filter((t: any) => !t.due_date || t.due_date > horizon);
  const fmt = (t: any) => ({
    title: t.title,
    due: t.due_date,
    priority: t.priority,
    lead_id: t.lead_id,
  });
  return {
    today,
    overdue: overdue.map(fmt),
    due_within_3_days: dueSoon.map(fmt),
    upcoming_count: upcoming.length,
  };
}

async function getLeadsNeedingAttention(userId: string) {
  const supabase = serviceClient();
  const today = torontoToday();
  const staleCutoff = addDays(today, -14);
  const { data } = await supabase
    .from("leads")
    .select(
      "id,status,created_at,last_contacted_at,next_followup_date,working_with_realtor,contacts(first_name,last_name)"
    )
    .eq("account_id", FC_ACCOUNT_ID)
    .eq("assigned_user_id", userId)
    .in("status", ["New", "Contacted", "Hot", "Cold"])
    .limit(200);
  const out: any[] = [];
  for (const l of (data || []) as any[]) {
    if (l.working_with_realtor) continue; // hands off — never surfaced
    const c: any = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts;
    const name = c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() : "Unknown";
    let reason: string | null = null;
    if (l.status === "New" && !l.last_contacted_at) reason = "New lead, never contacted";
    else if (l.next_followup_date && l.next_followup_date < today)
      reason = `Follow-up overdue (was due ${l.next_followup_date})`;
    else if (l.next_followup_date === today) reason = "Follow-up due today";
    else if (!l.next_followup_date && l.created_at && l.created_at.slice(0, 10) < staleCutoff)
      reason = "No follow-up set and the lead is over two weeks old";
    if (reason) {
      out.push({ name, status: l.status, reason, lead_id: l.id });
      if (out.length >= 10) break;
    }
  }
  return { count: out.length, leads: out };
}

async function getClosingsAhead() {
  const supabase = serviceClient();
  const today = torontoToday();
  const until = addDays(today, 45);
  const { data } = await supabase
    .from("deals")
    .select("id,closing_date,status,assigned_user_id,properties(address,city)")
    .eq("account_id", FC_ACCOUNT_ID)
    .gte("closing_date", today)
    .lte("closing_date", until)
    .order("closing_date", { ascending: true })
    .limit(15);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,full_name");
  const names = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));
  return (data || []).map((d: any) => {
    const prop: any = Array.isArray(d.properties) ? d.properties[0] : d.properties;
    return {
      address: prop ? `${prop.address}${prop.city ? ", " + prop.city : ""}` : "Property",
      closing_date: d.closing_date,
      status: d.status,
      agent: names.get(d.assigned_user_id) || "",
    };
  });
}

async function searchListings(args: any) {
  const params = new URLSearchParams({ mode: "search", scope: "local", top: "5" });
  if (args.q) params.set("q", String(args.q));
  if (args.city) params.set("city", String(args.city));
  if (args.minPrice) params.set("minPrice", String(args.minPrice));
  if (args.maxPrice) params.set("maxPrice", String(args.maxPrice));
  if (args.beds) params.set("beds", String(args.beds));
  const res = await fetch(`https://www.thefcgroup.ca/api/idx?${params}`).catch(() => null);
  if (!res || !res.ok) return { error: "Listing search is unavailable right now." };
  const data: any = await res.json().catch(() => null);
  const rows = (data?.listings || []).map((l: any) => ({
    address: l.UnparsedAddress,
    city: l.City,
    price: l.ListPrice,
    beds: l.BedroomsTotal,
    baths: l.BathroomsTotalInteger,
    mls: l.ListingKey,
    link: `https://www.thefcgroup.ca/listings/${l.ListingKey}`,
  }));
  return { total: data?.total ?? rows.length, listings: rows };
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_my_tasks",
      description:
        "The signed-in user's open tasks: overdue, due within 3 days, and how many more are upcoming.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_leads_needing_attention",
      description:
        "The user's leads that need attention (new/never contacted, overdue or due follow-ups, stale). Leads working with another realtor are always excluded.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_closings_ahead",
      description: "Deals closing in the next 45 days, with dates and agents.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_listings",
      description:
        "Search live MLS listings in Durham and the Kawarthas (the public IDX feed).",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Address text or postal code fragment" },
          city: { type: "string" },
          minPrice: { type: "number" },
          maxPrice: { type: "number" },
          beds: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_offer",
      description:
        "The user wants to prepare an offer. Returns a link to the offer workspace; mention the MLS# if they gave one.",
      parameters: {
        type: "object",
        properties: { mls: { type: "string" } },
      },
    },
  },
];

async function runTool(name: string, args: any, userId: string) {
  switch (name) {
    case "get_my_tasks":
      return getMyTasks(userId);
    case "get_leads_needing_attention":
      return getLeadsNeedingAttention(userId);
    case "get_closings_ahead":
      return getClosingsAhead();
    case "search_listings":
      return searchListings(args || {});
    case "start_offer":
      return { workspace: "/dashboard/offers/new", mls: args?.mls || null };
    default:
      return { error: "unknown tool" };
  }
}

// ---------------------------------------------------------------------------
// route
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const member = await resolveMember(req);
    if (!member) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    // The CRM project's key was entered as OPEN_PI_KEY — accept both names.
    const openAiKey = process.env.OPENAI_API_KEY || process.env.OPEN_PI_KEY;
    if (!openAiKey) {
      return NextResponse.json({
        ok: true,
        reply:
          "I'm here, but my language model isn't switched on for the CRM yet (no API key configured). Everything else — tasks, offers, listings — still works from the menus.",
      });
    }
    const body = (await req.json().catch(() => ({}))) as any;
    const history: any[] = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const today = torontoToday();
    const system = {
      role: "system",
      content:
        `You are Rea, the in-CRM assistant for the Fennessey Comeau Group ` +
        `(RE/MAX Hallmark First Group Realty Ltd., Whitby, Ontario). You are talking with ` +
        `${member.name}. Today is ${today} in Toronto. Be brief, warm and practical — short ` +
        `answers with real numbers, no filler. Use your tools for anything about tasks, leads, ` +
        `closings or listings instead of guessing. Rules: you never send email; leads flagged ` +
        `as working with another realtor are hands-off (price-change emails only) and your ` +
        `tools already exclude them; for offers, use start_offer and point them to the workspace. ` +
        `When a tool returns a workspace link or listing links, mention them plainly — the chat ` +
        `shows them as buttons under your message.`,
    };
    const messages: any[] = [
      system,
      ...history
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) })),
    ];
    const links: { label: string; href: string }[] = [];

    for (let round = 0; round < 4; round++) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: 0.3,
        }),
      });
      if (!res.ok) {
        return NextResponse.json({
          ok: true,
          reply: "I hit a snag reaching my language model just now — give me another try in a moment.",
        });
      }
      const data: any = await res.json();
      const msg = data?.choices?.[0]?.message;
      if (!msg) break;
      messages.push(msg);
      const calls = msg.tool_calls || [];
      if (calls.length === 0) {
        return NextResponse.json({
          ok: true,
          reply: msg.content || "Done.",
          links: links.length ? links : undefined,
        });
      }
      for (const call of calls) {
        let args: any = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        const result = await runTool(call.function.name, args, member.userId);
        if (call.function.name === "start_offer") {
          links.push({ label: "Open the offer workspace", href: "/dashboard/offers/new" });
        }
        if (call.function.name === "search_listings" && (result as any).listings) {
          for (const l of (result as any).listings.slice(0, 5)) {
            links.push({ label: `${l.address} — $${Number(l.price).toLocaleString()}`, href: l.link });
          }
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 6000),
        });
      }
    }
    return NextResponse.json({
      ok: true,
      reply: "Here's what I found — anything else?",
      links: links.length ? links : undefined,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "Chat failed." },
      { status: 500 }
    );
  }
}

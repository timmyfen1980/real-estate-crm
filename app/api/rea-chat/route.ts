/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/rea-chat — the in-CRM Rea assistant (bottom-right chat).
// Auth: signed-in team member (session + account membership), or the
// agent Bearer secret (acts as the account owner, for testing).
// Body: { messages: [{ role: 'user'|'assistant', content }] }
// Returns: { ok, reply, links?: [{ label, href }] }
//
// Rea answers from live CRM data via tools — never from memory alone:
//   get_my_tasks, get_leads_needing_attention, get_closings_ahead,
//   search_listings, find_contact (CRM contacts lookup), start_offer
//   (hands off to the offer workspace).
// Guided offer intake (voice or text): begin_offer_intake creates a real
// offer package, update_offer_fields writes each answer into its deal,
// get_offer_status reads it back, generate_offer_forms builds the PDFs.
// She drafts and points; she never sends email.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { validateDeal, validate801, validateRep } from "@/lib/offerPdf";

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

// Look a person up in the CRM contacts by name — partial, case-insensitive.
// Used when the user names a party and says/implies they're a contact, so
// the intake can run on the contact's real details instead of re-asking.
async function findContact(args: any) {
  const raw = String(args?.name || "").trim();
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/[%,]/g, ""))
    .filter(Boolean);
  if (!tokens.length) return { error: "No name given." };
  const supabase = serviceClient();
  const cols =
    "id,first_name,last_name,preferred_name,email,phone,address,city,province,postal_code,birthday";
  const seen = new Map<string, any>();
  const addRows = (rows: any[] | null) => {
    for (const r of rows || []) if (!seen.has(r.id)) seen.set(r.id, r);
  };
  // First token → first name, the rest → last name (the pattern the offer
  // packages route already uses to resolve a buyer name to a contact).
  if (tokens.length > 1) {
    const { data } = await supabase
      .from("contacts")
      .select(cols)
      .eq("account_id", FC_ACCOUNT_ID)
      .ilike("first_name", `%${tokens[0]}%`)
      .ilike("last_name", `%${tokens.slice(1).join(" ")}%`)
      .limit(5);
    addRows(data);
  }
  // Fallback: any name token hits either name field (single names, or a
  // name stored differently than the user said it).
  if (seen.size === 0) {
    const ors = tokens
      .map((t) => `first_name.ilike.%${t}%,last_name.ilike.%${t}%`)
      .join(",");
    const { data } = await supabase
      .from("contacts")
      .select(cols)
      .eq("account_id", FC_ACCOUNT_ID)
      .or(ors)
      .limit(5);
    addRows(data);
  }
  const matches = Array.from(seen.values())
    .slice(0, 5)
    .map((c: any) => ({
      contact_id: c.id,
      name: `${c.first_name || ""} ${c.last_name || ""}`.trim(),
      preferred_name: c.preferred_name || undefined,
      email: c.email || undefined,
      phone: c.phone || undefined,
      address:
        [c.address, c.city, c.province, c.postal_code].filter(Boolean).join(", ") ||
        undefined,
      date_of_birth: c.birthday ? String(c.birthday).slice(0, 10) : undefined,
    }));
  return { query: raw, count: matches.length, matches };
}

// ---------------------------------------------------------------------------
// guided offer intake (voice or text)
// ---------------------------------------------------------------------------
// The chat builds a real offer package the same way the workspace does:
// a package row is created up front, the property is prefilled from the
// DLA/IDX feed (the same /api/offers/prefill the Prepare-an-Offer page
// uses), and the "still needed" list comes from the SAME validators the
// generate route enforces (lib/offerPdf) — so Rea asks only for what is
// actually missing, one question at a time, and every answer is written
// into the package's deal snapshot via the same update the workspace
// autosave performs. Defaults mirror the workspace's own defaults
// (agreement date today, irrevocable by the Buyer at 11:59 p.m.,
// deposit held by our brokerage, 90-day holdover on the 371) and are
// always surfaced in the read-back summary for correction.

const OUR_BROKERAGE = "RE/MAX Hallmark First Group Realty Ltd.";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DATE_PATHS = [
  "agreement_date",
  "completion_date",
  "title_search_date",
  "irrevocable.date",
  "submitted.date",
  "rep.term_start",
  "rep.term_end",
];
const NAME_PATHS = ["buyers", "sellers", "rep.clients", "rep.designated_reps"];
const STANDARD_KEEP = ["A", "STD-SURVEY", "STD-VIEWINGS", "STD-WARRANTY", "ZB"];

interface IntakeQuestion {
  key: string;
  question: string;
  options?: string[];
}

function splitIso(iso: string) {
  if (!iso) return { day: "", month: "", year: "" };
  const [y, m, d] = String(iso).split("-");
  return { day: d || "", month: MONTH_NAMES[Number(m) - 1] || "", year: (y || "").slice(2) };
}

function splitToIso(d: any): string {
  if (!d || !d.day || !d.month) return "";
  const mi = MONTH_NAMES.indexOf(d.month);
  if (mi < 0) return "";
  const yr = String(d.year || "").length === 2 ? `20${d.year}` : String(d.year || "");
  if (!yr) return "";
  return `${yr}-${String(mi + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return dt.toISOString().slice(0, 10);
}

function setPath(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function fmtMoney(v: any): string {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString("en-US")}` : "";
}

function fmtSplitDate(d: any): string {
  if (!d || !d.day || !d.month) return "";
  const yr = d.year ? (String(d.year).length === 2 ? `20${d.year}` : d.year) : "";
  return `${d.month} ${d.day}${yr ? `, ${yr}` : ""}`;
}

function textLines(t: any): string[] {
  if (Array.isArray(t)) return t.map(String).map((s) => s.trim()).filter(Boolean);
  if (!t) return [];
  return String(t)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Collapse a validator's raw missing path ("irrevocable.date.day",
// "rep.clients (buyer name(s))", "term_end.month") to the one
// conversational question that covers it.
function baseMissingPath(m: string): string {
  const p = m.split(" (")[0].trim();
  if (p.startsWith("term_start")) return "rep.term_start";
  if (p.startsWith("term_end")) return "rep.term_end";
  if (p === "rep.commission") return "rep.commission_purchase_pct";
  if (p.startsWith("submitted")) return "submitted";
  for (const dp of DATE_PATHS) {
    if (p === dp || p.startsWith(dp + ".")) return dp;
  }
  return p;
}

function questionCatalogue(deal: any): IntakeQuestion[] {
  const completionIso = splitToIso(deal?.completion_date);
  const titleIso = completionIso ? addDays(completionIso, -15) : "";
  const titleLabel = titleIso ? fmtSplitDate(splitIso(titleIso)) : "";
  return [
    { key: "buyers", question: "What are the buyers' full legal names?" },
    {
      key: "sellers",
      question:
        "What are the sellers' full legal names? (Say \"not yet\" if you don't have them — we can still draft the rest.)",
    },
    { key: "property.address", question: "What's the property address?" },
    { key: "property.city", question: "What city is the property in?" },
    {
      key: "property.legal_description",
      question:
        "What's the legal description? It's on the listing sheet or the DLA printout — or say \"not yet\".",
    },
    { key: "price", question: "What's the offer price?" },
    { key: "deposit", question: "How much is the deposit?" },
    {
      key: "deposit_due",
      question: "When is the deposit due?",
      options: ["Upon acceptance", "Within 24 hours of acceptance", "With the offer"],
    },
    { key: "deposit_holder", question: "Who will hold the deposit?" },
    {
      key: "irrevocable.date",
      question: `The offer is irrevocable by the Buyer until ${deal?.irrevocable?.time || "11:59 p.m."} — on what date?`,
    },
    { key: "completion_date", question: "What's the closing date?" },
    {
      key: "title_search_date",
      question: titleLabel
        ? `Title search date — ${titleLabel} (about two weeks before closing) is typical. Use that, or give me a different date.`
        : "What's the title search (requisition) date?",
      options: titleLabel ? [titleLabel] : undefined,
    },
    {
      key: "hst",
      question: "HST — is it in addition to the purchase price, or included in it?",
      options: ["In addition", "Included"],
    },
    { key: "listing_brokerage.brokerage", question: "What's the listing brokerage?" },
    { key: "listing_brokerage.agent", question: "Who's the listing agent?" },
    { key: "selling_brokerage.agent", question: "Which of our agents is presenting the offer?" },
    {
      key: "submitted",
      question:
        "How is the offer being submitted, and at what time? (For example: by email at 6:30 p.m.)",
    },
    {
      key: "rep.term_end",
      question: "The buyer representation agreement starts today — how long should it run?",
      options: ["6 months", "3 months", "12 months"],
    },
    {
      key: "rep.geographic_location",
      question: "What area should the buyer agreement cover?",
      options: ["Durham Region", "Durham Region and the GTA", "The GTA"],
    },
    {
      key: "rep.commission_purchase_pct",
      question: "If they buy, what commission percent goes on the buyer agreement? (2.5% is the usual.)",
    },
    {
      key: "rep.designated_reps",
      question: "Who are the designated representatives on the buyer agreement?",
    },
    { key: "rep.clients", question: "What are the buyers' full legal names for the agreement?" },
  ];
}

function computeStillNeeded(deal: any, forms: string[]): IntakeQuestion[] {
  const missing = new Set<string>();
  if (forms.some((f) => ["100", "101", "102"].includes(f))) {
    for (const m of validateDeal(deal)) missing.add(baseMissingPath(m));
  }
  if (forms.includes("801")) {
    for (const m of validate801(deal)) missing.add(baseMissingPath(m));
  }
  if (forms.includes("371")) {
    for (const m of validateRep(deal, "371")) missing.add(baseMissingPath(m));
  }
  // The buyer agreement's clients are the buyers — never ask twice.
  if (Array.isArray(deal?.buyers) && deal.buyers.filter(Boolean).length) {
    missing.delete("rep.clients");
  }
  // Seeded by default (workspace defaults) — covered by the read-back.
  missing.delete("rep.term_start");
  missing.delete("rep.designated_reps");
  const skipped: string[] = Array.isArray(deal?.intake_skipped) ? deal.intake_skipped : [];
  const out = questionCatalogue(deal).filter(
    (q) => missing.has(q.key) && !skipped.includes(q.key)
  );
  if (forms.some((f) => ["100", "101", "102"].includes(f))) {
    // Conditions are settled when the intake recorded a choice OR the deal
    // already carries them — a workspace-built (or resumed) package always
    // has standard_codes set (null means "all seven") or condition terms,
    // and must never be re-asked about conditions it already has.
    const conditionsDone =
      deal?.intake_conditions_done ||
      deal?.standard_codes !== undefined ||
      !!deal?.condition_terms;
    if (!conditionsDone) {
      out.push({
        key: "conditions",
        question:
          "Conditions — keep the standard financing and home inspection clauses (5 banking days each, to 6:00 p.m.)?",
        options: [
          "Standard — financing + inspection",
          "Financing only",
          "Inspection only",
          "No conditions",
        ],
      });
    }
    if (
      !(Array.isArray(deal?.chattels) && deal.chattels.filter(Boolean).length) &&
      !deal?.intake_chattels_done
    ) {
      out.push({
        key: "chattels",
        question:
          "Chattels included — say \"standard\" for the usual list (fridge, stove, dishwasher, washer, dryer, light fixtures, window coverings, furnace and A/C), or tell me what's included.",
      });
    }
  }
  return out;
}

function buildSummary(deal: any, forms: string[]) {
  const ct = deal?.condition_terms || {};
  const codes: string[] | null = Array.isArray(deal?.standard_codes)
    ? deal.standard_codes.map(String)
    : null;
  const hasB = !codes || codes.includes("B");
  const hasC = !codes || codes.includes("C");
  const condParts: string[] = [];
  if (hasB) {
    condParts.push(
      `financing (${ct.financing?.days || "5"} banking days, to ${ct.financing?.time || "6:00 p.m."})`
    );
  }
  if (hasC) {
    condParts.push(
      `home inspection (${ct.inspection?.days || "5"} banking days, to ${ct.inspection?.time || "6:00 p.m."})`
    );
  }
  const rep = forms.includes("371") ? deal?.rep : null;
  return {
    property: [deal?.property?.address, deal?.property?.city].filter(Boolean).join(", "),
    buyers: (deal?.buyers || []).filter(Boolean).join(" and "),
    sellers: (deal?.sellers || []).filter(Boolean).join(" and "),
    price: fmtMoney(deal?.price),
    deposit: [
      fmtMoney(deal?.deposit),
      deal?.deposit_due === "upon_acceptance" ? "upon acceptance" : deal?.deposit_due || "",
      deal?.deposit_holder ? `held by ${deal.deposit_holder}` : "",
    ]
      .filter(Boolean)
      .join(", "),
    closing: fmtSplitDate(deal?.completion_date),
    title_search: fmtSplitDate(deal?.title_search_date),
    irrevocable: deal?.irrevocable
      ? `by ${deal.irrevocable.by || "the Buyer"} until ${deal.irrevocable.time || ""} on ${fmtSplitDate(deal.irrevocable.date)}`
      : "",
    hst: deal?.hst === "in_addition" ? "in addition to the price" : deal?.hst === "included" ? "included in the price" : "",
    conditions: condParts.length ? condParts.join(" + ") : "none",
    chattels: (deal?.chattels || []).filter(Boolean).join("; "),
    buyer_agreement: rep
      ? [
          rep.commission_purchase_pct ? `${rep.commission_purchase_pct}% commission on a purchase` : "",
          rep.holdover_days ? `${rep.holdover_days}-day holdover` : "",
          rep.geographic_location ? `covers ${rep.geographic_location}` : "",
          rep.term_start && rep.term_end
            ? `runs ${fmtSplitDate(rep.term_start)} to ${fmtSplitDate(rep.term_end)}`
            : "",
        ]
          .filter(Boolean)
          .join(", ")
      : undefined,
    forms,
  };
}

function intakeState(packageId: string, deal: any, forms: string[]) {
  const still = computeStillNeeded(deal, forms);
  return {
    package_id: packageId,
    workspace: `/dashboard/offers/${packageId}`,
    property: deal?.property || {},
    list_price: deal?.intake_list_price || undefined,
    still_needed: still,
    next_question: still[0] || null,
    skipped: Array.isArray(deal?.intake_skipped) ? deal.intake_skipped : [],
    summary: buildSummary(deal, forms),
    ready_to_generate: still.length === 0,
  };
}

async function loadPackageDeal(packageId: string): Promise<any | null> {
  const supabase = serviceClient();
  const { data } = await supabase
    .from("offer_packages")
    .select("deal")
    .eq("account_id", FC_ACCOUNT_ID)
    .eq("id", packageId)
    .maybeSingle();
  return data?.deal || null;
}

async function savePackageDeal(packageId: string, deal: any): Promise<void> {
  const supabase = serviceClient();
  const prop = deal.property || {};
  const { error } = await supabase
    .from("offer_packages")
    .update({
      deal,
      address: prop.address || undefined,
      city: prop.city || undefined,
      mls: prop.mls || undefined,
    })
    .eq("account_id", FC_ACCOUNT_ID)
    .eq("id", packageId);
  if (error) throw new Error(error.message);
}

function normalizeAddr(s: any): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// When prefill answers a full street address with a candidate list, a
// candidate whose street number AND street name both appear in what the
// user typed is not really a choice — it's the property. Picking it
// automatically (only when exactly one candidate qualifies) saves the
// pointless "please confirm the property" round-trip.
function exactCandidateMatch(query: string, candidates: any[]): any | null {
  const qTokens = new Set(normalizeAddr(query).split(" ").filter(Boolean));
  if (!qTokens.size) return null;
  const hits = candidates.filter((c: any) => {
    const parts = normalizeAddr(c.address).split(" ").filter(Boolean);
    if (parts.length < 2) return false;
    return qTokens.has(parts[0]) && qTokens.has(parts[1]);
  });
  return hits.length === 1 ? hits[0] : null;
}

// An in-progress package for the same property already exists for this
// user (same MLS#, or the same street address)? Resuming it beats a
// duplicate: everything already collected (buyers, sellers, price…)
// stays, and the intake just continues where it left off.
async function findExistingPackage(userId: string, deal: any) {
  const mls = String(deal?.property?.mls || "").trim().toLowerCase();
  const addr = normalizeAddr(deal?.property?.address);
  if (!mls && !addr) return null;
  const supabase = serviceClient();
  const { data } = await supabase
    .from("offer_packages")
    .select("id, deal, status, mls, address, created_at")
    .eq("account_id", FC_ACCOUNT_ID)
    .eq("created_by", userId)
    .neq("status", "dead")
    .order("created_at", { ascending: false })
    .limit(25);
  for (const row of (data || []) as any[]) {
    const rMls = String(row.mls || row.deal?.property?.mls || "")
      .trim()
      .toLowerCase();
    if (mls && rMls && rMls === mls) return row;
    const rAddr = normalizeAddr(row.address || row.deal?.property?.address);
    if (
      addr &&
      rAddr &&
      (rAddr === addr || rAddr.startsWith(addr) || addr.startsWith(rAddr))
    ) {
      return row;
    }
  }
  return null;
}

async function beginOfferIntake(
  args: any,
  ctx: { userId: string; name: string; origin: string }
) {
  const forms: string[] = ["100"];
  if (args?.include_bra) forms.push("371");
  if (args?.include_801) forms.push("801");
  const mls = String(args?.mls || "").trim();
  const query = String(args?.query || "").trim();
  let prefill: any = {};
  let exactMatched = false;
  if (mls || query) {
    try {
      const res = await fetch(`${ctx.origin}/api/offers/prefill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.REA_AGENT_SECRET || ""}`,
        },
        body: JSON.stringify(mls ? { mls } : { query }),
      });
      const data: any = await res.json().catch(() => null);
      if (data?.ok && Array.isArray(data.candidates) && data.candidates.length) {
        // The user gave a full address and exactly one candidate IS that
        // address — take it and move on instead of asking them to pick
        // their own property out of a list.
        const exact = query ? exactCandidateMatch(query, data.candidates) : null;
        if (exact?.key) {
          try {
            const res2 = await fetch(`${ctx.origin}/api/offers/prefill`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.REA_AGENT_SECRET || ""}`,
              },
              body: JSON.stringify({ mls: exact.key }),
            });
            const data2: any = await res2.json().catch(() => null);
            if (data2?.ok && data2.prefill) {
              prefill = data2.prefill;
              exactMatched = true;
            }
          } catch {
            // fall through to the pick list below
          }
        }
        if (!prefill.address) {
          return {
            status: "choose_property",
            candidates: data.candidates.map((c: any) => ({
              mls: c.key,
              address: c.address,
              city: c.city,
              price: c.price,
            })),
            note: "Ask which property, then call begin_offer_intake again with its mls.",
          };
        }
      }
      if (data?.ok && data.prefill && !exactMatched) prefill = data.prefill;
    } catch {
      // Prefill is a convenience — the questions cover whatever it misses.
    }
  }
  const today = torontoToday();
  const buyers: string[] = Array.isArray(args?.buyer_names)
    ? args.buyer_names.map(String).map((s: string) => s.trim()).filter(Boolean)
    : [];
  const deal: any = {
    buyers,
    sellers: [],
    property: {
      address: prefill.address || (mls ? "" : query),
      city: prefill.city || "",
      legal_description: prefill.legal_description || undefined,
      pin: prefill.pin ? String(prefill.pin) : undefined,
      frontage: prefill.frontage ? String(prefill.frontage) : undefined,
      depth: prefill.depth ? String(prefill.depth) : undefined,
      frontage_side: prefill.street_side || undefined,
      frontage_street: prefill.street_name || undefined,
      mls: mls || prefill.mls || undefined,
    },
    agreement_date: splitIso(today),
    deposit_holder: OUR_BROKERAGE,
    irrevocable: { by: "The Buyer", time: "11:59 p.m.", date: splitIso(today) },
    chattels: textLines(prefill.chattels),
    exclusions: textLines(prefill.exclusions),
    listing_brokerage: prefill.listing_brokerage
      ? {
          brokerage: String(prefill.listing_brokerage),
          agent: prefill.listing_agent || undefined,
          phone: prefill.listing_agent_phone || undefined,
        }
      : undefined,
    selling_brokerage: { brokerage: OUR_BROKERAGE, agent: ctx.name },
    submitted: { via: "", time: "", date: splitIso(today) },
    coop: prefill.coop_share
      ? { share: String(prefill.coop_share), basis: "of the purchase price" }
      : undefined,
    intake_forms: forms,
    intake_list_price: prefill.list_price ? Number(prefill.list_price) : undefined,
  };
  if (forms.includes("371")) {
    deal.rep = {
      kind: "371",
      clients: buyers,
      designated_reps: [ctx.name],
      term_start: splitIso(today),
      geographic_location: "",
      commission_purchase_pct: "",
      holdover_days: "90",
    };
  }
  // A package for this property is already on the go for this user —
  // resume it instead of starting a duplicate. Everything already on it
  // (buyers, sellers, price…) stays, so those questions never get asked
  // again. force_new=true is the explicit escape hatch.
  if (!args?.force_new) {
    const existing = await findExistingPackage(ctx.userId, deal).catch(() => null);
    if (existing?.id) {
      const eDeal: any = existing.deal || {};
      const eForms: string[] =
        Array.isArray(eDeal.intake_forms) && eDeal.intake_forms.length
          ? [...eDeal.intake_forms]
          : [...forms];
      for (const f of forms) if (!eForms.includes(f)) eForms.push(f);
      let dirty = false;
      if (JSON.stringify(eDeal.intake_forms || []) !== JSON.stringify(eForms)) {
        eDeal.intake_forms = eForms;
        dirty = true;
      }
      // Resuming with a buyer agreement the package doesn't have yet:
      // seed the rep block the same way a fresh intake does.
      if (eForms.includes("371") && !eDeal.rep) {
        const eBuyers =
          Array.isArray(eDeal.buyers) && eDeal.buyers.filter(Boolean).length
            ? eDeal.buyers
            : deal.buyers || [];
        if (!Array.isArray(eDeal.buyers) || !eDeal.buyers.filter(Boolean).length) {
          eDeal.buyers = eBuyers;
        }
        eDeal.rep = {
          kind: "371",
          clients: eBuyers,
          designated_reps: [ctx.name],
          term_start: splitIso(today),
          geographic_location: "",
          commission_purchase_pct: "",
          holdover_days: "90",
        };
        dirty = true;
      }
      if (dirty) await savePackageDeal(existing.id, eDeal).catch(() => {});
      const st = intakeState(existing.id, eDeal, eForms);
      return {
        status: "existing_package",
        existing: {
          buyers: st.summary.buyers,
          sellers: st.summary.sellers,
          price: st.summary.price,
          status: existing.status,
        },
        ...st,
        note:
          "A package for this property already exists for this user — do NOT create another one. Ask ONE question: continue this package (tell them what's already on it — buyers, sellers, price) or start a fresh one? If they say continue, yes, or anything ambiguous, carry on with this package_id and ask its next_question. Only if they clearly say fresh/new do you call begin_offer_intake again with force_new=true and the same mls/query.",
      };
    }
  }
  const supabase = serviceClient();
  const { data: pkg, error } = await supabase
    .from("offer_packages")
    .insert({
      account_id: FC_ACCOUNT_ID,
      created_by: ctx.userId,
      address: deal.property.address || "Untitled offer",
      city: deal.property.city || null,
      mls: deal.property.mls || null,
      status: "draft",
      partial: false,
      deal,
      documents: [],
    })
    .select("id")
    .single();
  if (error) return { error: `Could not create the package: ${error.message}` };
  return {
    status: "started",
    prefill_source: prefill.address ? "listing_feed" : "none",
    ...(exactMatched
      ? {
          note: "The address they gave matched one listing exactly, so it was picked automatically — do NOT ask them to confirm the property; go straight to the first question.",
        }
      : {}),
    ...intakeState(pkg.id, deal, forms),
  };
}

function applyConditions(deal: any, value: any): void {
  const v = value && typeof value === "object" ? value : { choice: String(value || "standard") };
  const choice = String(v.choice || "standard").toLowerCase();
  const fin = {
    days: String(v.financing_days || "5"),
    time: String(v.financing_time || "6:00 p.m."),
  };
  const insp = {
    days: String(v.inspection_days || "5"),
    time: String(v.inspection_time || "6:00 p.m."),
  };
  if (choice.includes("no conditions") || choice === "none") {
    deal.standard_codes = [...STANDARD_KEEP];
    delete deal.condition_terms;
  } else if (choice.includes("financing only")) {
    deal.standard_codes = [...STANDARD_KEEP, "B"];
    deal.condition_terms = { financing: fin };
  } else if (choice.includes("inspection only")) {
    deal.standard_codes = [...STANDARD_KEEP, "C"];
    deal.condition_terms = { inspection: insp };
  } else {
    deal.standard_codes = null;
    deal.condition_terms = { financing: fin, inspection: insp };
  }
  deal.intake_conditions_done = true;
}

async function updateOfferFields(args: any) {
  const packageId = String(args?.package_id || "");
  if (!packageId) return { error: "Missing package_id." };
  const deal = await loadPackageDeal(packageId);
  if (!deal) return { error: "Package not found." };
  const forms: string[] =
    Array.isArray(deal.intake_forms) && deal.intake_forms.length ? deal.intake_forms : ["100"];
  const fields: any[] = Array.isArray(args?.fields) ? args.fields : [];
  for (const f of fields) {
    const path = String(f?.path || "");
    let value = f?.value;
    if (!path) continue;
    if (path === "__skip") {
      const key = String(value || "");
      if (key) {
        deal.intake_skipped = Array.from(
          new Set([...(Array.isArray(deal.intake_skipped) ? deal.intake_skipped : []), key])
        );
        if (key === "conditions") deal.intake_conditions_done = true;
        if (key === "chattels") deal.intake_chattels_done = true;
      }
      continue;
    }
    if (path === "conditions") {
      applyConditions(deal, value);
      continue;
    }
    if (path === "chattels") {
      deal.chattels = textLines(value);
      deal.intake_chattels_done = true;
      continue;
    }
    if (path === "submitted") {
      if (value && typeof value === "object") {
        deal.submitted = {
          ...(deal.submitted || {}),
          ...(value.via ? { via: String(value.via) } : {}),
          ...(value.time ? { time: String(value.time) } : {}),
        };
      }
      continue;
    }
    if (DATE_PATHS.includes(path)) {
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        value = splitIso(value);
      } else if (value && typeof value === "object" && value.months) {
        value = splitIso(addMonthsIso(torontoToday(), Number(value.months) || 6));
      } else if (typeof value === "string" && /month/i.test(value)) {
        value = splitIso(addMonthsIso(torontoToday(), parseInt(value, 10) || 6));
      }
      setPath(deal, path, value);
      continue;
    }
    if (NAME_PATHS.includes(path)) {
      value = Array.isArray(value)
        ? value.map(String).map((s: string) => s.trim()).filter(Boolean)
        : String(value || "")
            .split(/\s+&\s+|\s+and\s+/i)
            .map((s: string) => s.trim())
            .filter(Boolean);
      setPath(deal, path, value);
      continue;
    }
    if (path === "price" || path === "deposit") {
      const n = Number(String(value).replace(/[^0-9.]/g, ""));
      setPath(deal, path, Number.isFinite(n) && n > 0 ? n : value);
      continue;
    }
    if (path === "deposit_due") {
      setPath(deal, path, /upon acceptance/i.test(String(value)) ? "upon_acceptance" : String(value));
      continue;
    }
    if (path === "hst") {
      setPath(
        deal,
        path,
        /addition/i.test(String(value))
          ? "in_addition"
          : /included/i.test(String(value))
            ? "included"
            : value
      );
      continue;
    }
    setPath(deal, path, value);
  }
  // Keep the buyer agreement's clients in step with the buyers.
  if (
    deal.rep &&
    Array.isArray(deal.buyers) &&
    deal.buyers.filter(Boolean).length &&
    !(Array.isArray(deal.rep.clients) && deal.rep.clients.filter(Boolean).length)
  ) {
    deal.rep.clients = deal.buyers;
  }
  await savePackageDeal(packageId, deal);
  return intakeState(packageId, deal, forms);
}

async function getOfferStatus(args: any) {
  const packageId = String(args?.package_id || "");
  if (!packageId) return { error: "Missing package_id." };
  const deal = await loadPackageDeal(packageId);
  if (!deal) return { error: "Package not found." };
  const forms: string[] =
    Array.isArray(deal.intake_forms) && deal.intake_forms.length ? deal.intake_forms : ["100"];
  return intakeState(packageId, deal, forms);
}

async function generateOfferForms(args: any, ctx: { origin: string }) {
  const packageId = String(args?.package_id || "");
  if (!packageId) return { error: "Missing package_id." };
  const deal = await loadPackageDeal(packageId);
  if (!deal) return { error: "Package not found." };
  const forms: string[] =
    Array.isArray(args?.forms) && args.forms.length
      ? args.forms.map(String)
      : Array.isArray(deal.intake_forms) && deal.intake_forms.length
        ? deal.intake_forms
        : ["100"];
  const allowPartial = args?.allow_partial === true;
  const still = computeStillNeeded(deal, forms);
  if (still.length && !allowPartial) {
    return { generated: false, reason: "still_missing", ...intakeState(packageId, deal, forms) };
  }
  const res = await fetch(`${ctx.origin}/api/offers/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.REA_AGENT_SECRET || ""}`,
    },
    body: JSON.stringify({ deal, forms, package_id: packageId, allow_partial: allowPartial }),
  });
  const data: any = await res.json().catch(() => null);
  if (!data?.ok) {
    return {
      generated: false,
      error: data?.error || "Generation failed.",
      missing: data?.missing || undefined,
      ...intakeState(packageId, deal, forms),
    };
  }
  return {
    generated: true,
    partial: !!data.partial,
    files: (data.files || []).map((f: any) => ({
      form: f.form,
      filename: f.filename,
      pages: f.pages,
    })),
    package_id: packageId,
    workspace: `/dashboard/offers/${packageId}`,
    summary: buildSummary(deal, forms),
  };
}

// The chat client persists only the visible messages — tool results (and
// with them the package_id) are gone by the next request, which is how
// the model used to "forget" an intake mid-conversation and re-ask the
// property. So every turn re-derives the active intake: an explicit
// package_id from the client wins, then a workspace link in the history,
// then the user's newest chat-started package whose property this
// conversation is about. The POST handler turns a hit into a system
// note that locks the property and routes every answer to that package.
async function deriveActiveIntake(
  userId: string,
  history: any[],
  explicitId: string
): Promise<{ packageId: string; deal: any; forms: string[] } | null> {
  let pkgId = explicitId || "";
  if (!pkgId) {
    for (const m of history) {
      const match = String(m?.content || "").match(
        /\/dashboard\/offers\/([0-9a-fA-F-]{36})/
      );
      if (match) {
        pkgId = match[1];
        break;
      }
    }
  }
  if (pkgId) {
    const deal = await loadPackageDeal(pkgId);
    if (deal) {
      const forms: string[] =
        Array.isArray(deal.intake_forms) && deal.intake_forms.length
          ? deal.intake_forms
          : ["100"];
      return { packageId: pkgId, deal, forms };
    }
  }
  const supabase = serviceClient();
  const { data } = await supabase
    .from("offer_packages")
    .select("id, deal, created_at")
    .eq("account_id", FC_ACCOUNT_ID)
    .eq("created_by", userId)
    .neq("status", "dead")
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = ((data || []) as any[]).filter(
    (r) => Array.isArray(r.deal?.intake_forms) && r.deal.intake_forms.length
  );
  if (!rows.length) return null;
  const convo = history
    .map((m) => String(m?.content || ""))
    .join("\n")
    .toLowerCase();
  const addressed = rows.find((r) => {
    const key = normalizeAddr(r.deal?.property?.address)
      .split(" ")
      .slice(0, 3)
      .join(" ");
    return key && convo.includes(key);
  });
  const picked =
    addressed || (/offer package|still need/i.test(convo) ? rows[0] : null);
  if (!picked) return null;
  return { packageId: picked.id, deal: picked.deal, forms: picked.deal.intake_forms };
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
      name: "find_contact",
      description:
        "Look up a person in the team's CRM contacts by name (partial, case-insensitive). Use it whenever the user names a buyer, seller or tenant and says or implies they're a contact ('in my contacts', 'pull his information'), and during an intake when a named party isn't on the deal yet. Returns matches with email, phone, address and date of birth on file. On exactly one match during an intake, write the contact's full name into the deal with update_offer_fields (buyers — plus rep.clients when a buyer agreement is included) and briefly confirm what was pulled.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "The person's name as the user said it" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_offer",
      description:
        "The user wants to prepare an offer on their own in the workspace. Returns a link to the offer workspace; mention the MLS# if they gave one. When they want YOU to build it with them question by question, use begin_offer_intake instead.",
      parameters: {
        type: "object",
        properties: { mls: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "begin_offer_intake",
      description:
        "Start a guided offer intake (works the same by voice or text): creates the offer package, prefills the property from the listing feed, and returns still_needed plus next_question. Use this FIRST when the user asks you to put together an offer or a buyer package. Set include_bra=true when they mention buyer representation or a buyer package (adds Form 371 to the same intake). If it returns status choose_property, list the candidates, let the user pick, then call again with that mls. If it returns status existing_package, a package for that property is already on the go — follow its note (ask continue-or-fresh once; force_new=true only when they clearly want a fresh one). Once a package is started or resumed, never call this again for the same property.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The property address as the user said it" },
          mls: { type: "string", description: "MLS number / ListingKey, if given" },
          buyer_names: { type: "array", items: { type: "string" } },
          include_bra: { type: "boolean" },
          include_801: { type: "boolean" },
          force_new: {
            type: "boolean",
            description:
              "Only when the user explicitly wants a fresh package even though one already exists for this property",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_offer_fields",
      description:
        "Record the user's answers into the intake package. ONE call carrying EVERY fact the user just gave — a single message usually answers several questions at once; never split facts across turns and never hold a fact back to ask about it. Dates as YYYY-MM-DD strings (rep.term_end may be {months: 6}); money as plain numbers; names as plain strings. Special paths: 'conditions' with value {choice: 'standard' | 'financing only' | 'inspection only' | 'none', financing_days, inspection_days} — 'all the standard conditions', 'the usual conditions' or 'the conditions that are typically in it' all mean {choice: 'standard'}: record it, and conditions will not be asked again; 'chattels' with a string or an array (if the user says 'standard' or 'the typical chattels and fixtures', pass exactly: 'All existing light fixtures, broadloom where laid. Window coverings, fridge, stove, dishwasher, washer, dryer, air conditioner, furnace and related equipment.'); 'submitted' with {via, time} for the 801; and {path: '__skip', value: '<question key>'} when the user says skip / not yet. Returns the updated still_needed and next_question.",
      parameters: {
        type: "object",
        properties: {
          package_id: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                value: { description: "The answer value (string, number, array, or object per the path)" },
              },
              required: ["path", "value"],
            },
          },
        },
        required: ["package_id", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_offer_status",
      description:
        "The intake package's current state: everything collected so far as a plain summary, plus what is still needed. Use it to read the summary back for confirmation before generating.",
      parameters: {
        type: "object",
        properties: { package_id: { type: "string" } },
        required: ["package_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_offer_forms",
      description:
        "Generate the intake package's PDFs into the package. Call ONLY after you have read the summary back and the user confirmed it. If details are still missing it refuses and returns them; pass allow_partial=true only when the user explicitly wants a draft with the skipped items left blank.",
      parameters: {
        type: "object",
        properties: {
          package_id: { type: "string" },
          forms: { type: "array", items: { type: "string" } },
          allow_partial: { type: "boolean" },
        },
        required: ["package_id"],
      },
    },
  },
];

interface ToolCtx {
  userId: string;
  name: string;
  origin: string;
}

async function runTool(name: string, args: any, ctx: ToolCtx) {
  switch (name) {
    case "get_my_tasks":
      return getMyTasks(ctx.userId);
    case "get_leads_needing_attention":
      return getLeadsNeedingAttention(ctx.userId);
    case "get_closings_ahead":
      return getClosingsAhead();
    case "search_listings":
      return searchListings(args || {});
    case "find_contact":
      return findContact(args || {});
    case "start_offer":
      return { workspace: "/dashboard/offers/new", mls: args?.mls || null };
    case "begin_offer_intake":
      return beginOfferIntake(args || {}, ctx);
    case "update_offer_fields":
      return updateOfferFields(args || {});
    case "get_offer_status":
      return getOfferStatus(args || {});
    case "generate_offer_forms":
      return generateOfferForms(args || {}, ctx);
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
        `tools already exclude them. When a tool returns a workspace link or listing links, ` +
        `mention them plainly — the chat shows them as buttons under your message. ` +
        `GUIDED OFFER INTAKE: when they ask you to put together an offer — or a buyer package ` +
        `(buyer representation plus an offer) — call begin_offer_intake with the address or MLS# ` +
        `they gave (include_bra=true for a buyer package). If it returns choose_property, list ` +
        `the candidates and call again with the picked mls. Then ask ONLY the next_question it ` +
        `returns, one question at a time, in plain words — never bundle questions and never ask ` +
        `for anything the tools already filled. Every time they answer, call update_offer_fields ` +
        `with everything they gave you (they may answer several questions in one breath, by voice ` +
        `or text). Never invent a value they did not give. If they say skip or "not yet", record ` +
        `it with update_offer_fields {path: "__skip", value: "<question key>"} and move on. When ` +
        `next_question is null, call get_offer_status, read the summary back plainly — price, ` +
        `deposit, closing, irrevocability, conditions, chattels, and the buyer agreement terms ` +
        `if included, naming anything skipped as still to get — and ask them to confirm or ` +
        `correct it. Only after they confirm, call generate_offer_forms; if they correct ` +
        `something, update_offer_fields and read the summary back again. ` +
        `PROPERTY LOCK: once begin_offer_intake has started (or resumed) a package, the property is LOCKED for the rest of the conversation — never call begin_offer_intake or search_listings again for that property, and never ask them to confirm the property again. If a server note names an ACTIVE OFFER INTAKE with a package_id, use that package_id for every update_offer_fields / get_offer_status / generate_offer_forms call, and treat every message as answers to that intake. If your last message listed property candidates and they reply with one of them (an address, an MLS#, or a tapped suggestion), that IS their pick: call begin_offer_intake at once with that candidate's mls — never re-list the candidates and never ask them to confirm. ` +
        `CONTACTS: when they name a buyer, seller or tenant and say or hint the person is in the CRM ("in my contacts", "pull his information", "get her details"), or a named party is not on the deal yet during an intake, call find_contact with the name BEFORE asking anything else about that party. One match during an intake: write the contact's full legal name into the deal in the same turn (update_offer_fields — buyers, plus rep.clients when a buyer agreement is included) and confirm briefly what you pulled, e.g. "Got Johnny Ryan from your contacts — email and phone on file." Several matches: ask which one, once. No match: carry on with the name they gave and say the contact wasn't found. ` +
        `PHRASE MAPPING: one message can answer several questions — write ALL of them in ONE update_offer_fields call, never hold a fact back. "All the standard conditions", "the usual conditions", "standard conditions", "the conditions that are typically in it" → conditions {choice: "standard"}. "Standard chattels", "the typical chattels and fixtures", "the usual chattels" → the standard chattels paragraph from the update_offer_fields description. "HST is included" → hst included. Once a fact is recorded, never ask about it again.`,
    };
    const ctx: ToolCtx = {
      userId: member.userId,
      name: member.name,
      origin: new URL(req.url).origin,
    };
    const messages: any[] = [
      system,
      ...history
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) })),
    ];
    // If an intake is already on the go in this conversation, pin it back
    // into the model's context: the package_id only ever lived in tool
    // results, which the client doesn't persist. Without this note the
    // model re-runs the property search/confirm flow on every answer.
    const activeIntake = await deriveActiveIntake(
      member.userId,
      history,
      typeof body.package_id === "string" ? body.package_id : ""
    ).catch(() => null);
    if (activeIntake) {
      const st = intakeState(activeIntake.packageId, activeIntake.deal, activeIntake.forms);
      const addr =
        [activeIntake.deal?.property?.address, activeIntake.deal?.property?.city]
          .filter(Boolean)
          .join(", ") || "(address on file)";
      messages.push({
        role: "system",
        content:
          `ACTIVE OFFER INTAKE (server state — trust this over the conversation): package_id ${activeIntake.packageId}, property ${addr} — LOCKED. ` +
          `The package already exists and the property was already chosen: NEVER call begin_offer_intake or search_listings for this property again, and never ask the user to confirm the property. ` +
          `Treat the user's latest message purely as ANSWERS: pull out EVERY fact in it, call update_offer_fields ONCE with all of them (package_id ${activeIntake.packageId}), then get_offer_status, then ask only the next still-needed question. ` +
          `Still needed right now: ${
            st.still_needed.length
              ? st.still_needed.map((q) => q.question).join(" | ")
              : "nothing — read the summary back for confirmation"
          }. ` +
          `Collected so far: ${JSON.stringify(st.summary)}. ` +
          `Only if the user explicitly asks to start over, or to build an offer on a DIFFERENT property, do you call begin_offer_intake again.`,
      });
    }
    const links: { label: string; href: string }[] = [];
    let suggestions: string[] | undefined;

    for (let round = 0; round < 6; round++) {
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
          suggestions,
        });
      }
      for (const call of calls) {
        let args: any = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        const result: any = await runTool(call.function.name, args, ctx);
        if (call.function.name === "start_offer") {
          links.push({ label: "Open the offer workspace", href: "/dashboard/offers/new" });
        }
        if (result?.workspace && !links.some((l) => l.href === result.workspace)) {
          links.push({ label: "Open the package workspace", href: result.workspace });
        }
        if (result?.status === "choose_property" && Array.isArray(result.candidates)) {
          suggestions = result.candidates.map(
            (c: any) => `${c.address}${c.city ? `, ${c.city}` : ""} — MLS# ${c.mls}`
          );
        } else if (result?.next_question?.options) {
          suggestions = result.next_question.options;
        } else if (result && "next_question" in result) {
          suggestions = undefined;
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
      suggestions,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: "server_error", error: e?.message || "Chat failed." },
      { status: 500 }
    );
  }
}

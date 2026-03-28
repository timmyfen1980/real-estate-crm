import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const resend = new Resend(process.env.RESEND_API_KEY);

// 🔴 SET THIS
const DEFAULT_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";

// ✅ ALLOWED ORIGINS
const ALLOWED_ORIGINS = [
  "https://finwise-saas-landing-page-chi-five.vercel.app",
  "https://crm.thefcgroup.ca",
];

// ✅ ALWAYS RETURN STRING (FIXES YOUR ERROR)
function getCorsHeaders(origin: string | null) {
  const safeOrigin =
    origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  } as Record<string, string>;
}

// ✅ PRE-FLIGHT
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return NextResponse.json({}, { headers: getCorsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = getCorsHeaders(origin);

  try {
    const body = await req.json();

    const {
      first_name,
      last_name,
      email,
      phone,
      address,
      comments,
    } = body;

    if (!first_name || !email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. LOAD ACCOUNT
    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("id, owner_user_id, owner_email")
      .eq("id", DEFAULT_ACCOUNT_ID)
      .single();

    if (!account) {
      throw new Error("Account not found");
    }

    // 2. DUPLICATE LEAD CHECK
    const { data: existingLead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("account_id", account.id)
      .maybeSingle();

    let contactId: string | null = null;
    let leadId: string | null = existingLead?.id || null;

    // 3. CONTACT CHECK / CREATE
    const { data: existingContact } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("account_id", account.id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: contactError } = await supabaseAdmin
        .from("contacts")
        .insert({
          account_id: account.id,
          assigned_user_id: account.owner_user_id,
          first_name,
          last_name,
          email: normalizedEmail,
          phone,
          lifecycle_stage: "New",
          source: "Home Valuation",
          original_source: "Home Valuation",
        })
        .select("id")
        .single();

      if (contactError) throw contactError;

      contactId = newContact.id;
    }

    // 4. CREATE LEAD IF NOT EXISTS
    if (!existingLead) {
      const { data: newLead, error: leadError } = await supabaseAdmin
        .from("leads")
        .insert({
          account_id: account.id,
          contact_id: contactId,
          assigned_user_id: account.owner_user_id,
          user_id: account.owner_user_id,
          first_name,
          last_name,
          email: normalizedEmail,
          phone,
          source: "Home Valuation",
          status: "New",
          deal_type: "Seller",
        })
        .select("id")
        .single();

      if (leadError) throw leadError;

      leadId = newLead.id;
    }

    // 5. SEND EMAIL
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: account.owner_email,
      subject: "New Home Valuation Lead",
      html: `
        <h2>New Home Valuation Request</h2>

        <p><strong>Name:</strong> ${first_name} ${last_name || ""}</p>
        <p><strong>Email:</strong> ${normalizedEmail}</p>
        <p><strong>Phone:</strong> ${phone || "N/A"}</p>
        <p><strong>Address:</strong> ${address || "N/A"}</p>
        <p><strong>Comments:</strong> ${comments || "N/A"}</p>
      `,
    });

    return NextResponse.json(
      { success: true, lead_id: leadId },
      { headers }
    );
  } catch (err) {
    console.error("HOME VALUATION ERROR:", err);
    return NextResponse.json(
      { success: false },
      { status: 500, headers }
    );
  }
}
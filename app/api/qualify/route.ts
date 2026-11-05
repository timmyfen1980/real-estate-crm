import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { properName } from "@/lib/nameCase";
import {
  parseCampaignParam,
  resolveActiveCampaignSlug,
  stampContactCampaign,
} from "@/lib/leadCampaigns";

// POST /api/qualify — capture route for the "What Can I Qualify For?"
// quiz on thefcgroup.ca/qualify. Mirrors /api/home-buyers: creates or
// reuses the contact + buyer lead, enrolls in the buyer drip campaign,
// files the quiz answers as a note, stamps the Lead Campaign slug when
// the visitor arrived on a tracked link, and notifies the account owner.

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";

// The buyer follow-up drip (same campaign the Home Buyers Guide uses).
const BUYER_DRIP_CAMPAIGN_ID = "2b927570-cacb-4809-bd03-033ef413e99a";

const ALLOWED_ORIGINS = [
  "https://www.thefcgroup.ca",
  "https://thefcgroup.ca",
  "https://finwise-saas-landing-page-chi-five.vercel.app",
  "https://crm.thefcgroup.ca",
];

function getCorsHeaders(origin: string | null) {
  const safeOrigin =
    origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : "https://www.thefcgroup.ca";

  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  } as Record<string, string>;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");

  return NextResponse.json(
    {},
    {
      headers: getCorsHeaders(origin),
    }
  );
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = getCorsHeaders(origin);

  try {
    const formData = await req.formData();

    const first_name = properName(formData.get("first_name") as string);
    const last_name = properName(formData.get("last_name") as string);
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const income_range = formData.get("income_range") as string;
    const saved_range = formData.get("saved_range") as string;
    const debts_range = formData.get("debts_range") as string;
    const timeline = formData.get("timeline") as string;
    const door_now = formData.get("door_now") as string;
    const door_10 = formData.get("door_10") as string;
    const door_20 = formData.get("door_20") as string;

    const quizNotes = `
Qualify Quiz Lead

Household Income: ${income_range || "N/A"}

Down Payment Saved: ${saved_range || "N/A"}

Monthly Debts: ${debts_range || "N/A"}

Timeline: ${timeline || "N/A"}

Ballpark shown on the page:
- With what they have saved: ${door_now || "N/A"}
- With 10% down: ${door_10 || "N/A"}
- With 20% down: ${door_20 || "N/A"}
`.trim();

    if (!first_name || !email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("id, owner_user_id, owner_email")
      .eq("id", DEFAULT_ACCOUNT_ID)
      .single();

    if (!account) {
      throw new Error("Account not found");
    }

    const { data: existingLead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("account_id", account.id)
      .maybeSingle();

    let contactId: string | null = null;
    let leadId: string | null = existingLead?.id || null;

    const { data: existingContact } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("account_id", account.id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: contactError } =
        await supabaseAdmin
          .from("contacts")
          .insert({
            account_id: account.id,
            assigned_user_id: account.owner_user_id,
            first_name,
            last_name,
            email: normalizedEmail,
            phone,
            lifecycle_stage: "New",
            source: "Qualify Quiz",
            original_source: "Qualify Quiz",
          })
          .select("id")
          .single();

      if (contactError) {
        throw contactError;
      }

      contactId = newContact.id;
    }

    if (!existingLead) {
      const { data: newLead, error: leadError } =
        await supabaseAdmin
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
            source: "Qualify Quiz",
            status: "New",
            deal_type: "Buyer",
          })
          .select("id")
          .single();

      if (leadError) {
        throw leadError;
      }

      leadId = newLead.id;
    }

    // Lead Campaign attribution (fail-soft — tracking never breaks a
    // capture): stamp the contact when the slug matches an active
    // Lead Campaign.
    const slug = await resolveActiveCampaignSlug(
      account.id,
      parseCampaignParam(req, formData)
    );
    await stampContactCampaign(contactId, slug);

    const { data: existingEnrollment } = await supabaseAdmin
      .from("contact_campaigns")
      .select("id")
      .eq("contact_id", contactId)
      .eq("campaign_id", BUYER_DRIP_CAMPAIGN_ID)
      .maybeSingle();

    if (!existingEnrollment) {
      await supabaseAdmin
        .from("contact_campaigns")
        .insert([
          {
            contact_id: contactId,
            campaign_id: BUYER_DRIP_CAMPAIGN_ID,
            next_send_at: new Date().toISOString(),
          },
        ]);
    }

    await supabaseAdmin
      .from("notes")
      .insert([
        {
          lead_id: leadId,
          contact_id: contactId,
          user_id: account.owner_user_id,
          content: quizNotes,
        },
      ]);

    await resend.emails.send({
      from: "info@thefcgroup.ca",
      to: account.owner_email,
      subject: "New Qualify Quiz Lead",
      html: `
        <h2>New Qualify Quiz Lead</h2>

        <p><strong>Name:</strong> ${first_name} ${last_name || ""}</p>

        <p><strong>Email:</strong> ${normalizedEmail}</p>

        <p><strong>Phone:</strong> ${phone || "N/A"}</p>

        <p><strong>Household Income:</strong> ${income_range || "N/A"}</p>

        <p><strong>Down Payment Saved:</strong> ${saved_range || "N/A"}</p>

        <p><strong>Monthly Debts:</strong> ${debts_range || "N/A"}</p>

        <p><strong>Timeline:</strong> ${timeline || "N/A"}</p>

        <p><strong>Ballpark shown:</strong> ${door_now || "N/A"} now · ${door_10 || "N/A"} at 10% down · ${door_20 || "N/A"} at 20% down</p>
      `,
    });

    return NextResponse.json(
      {
        success: true,
        lead_id: leadId,
      },
      {
        headers,
      }
    );
  } catch (err) {
    console.error("QUALIFY QUIZ ERROR:", err);

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
        headers,
      }
    );
  }
}

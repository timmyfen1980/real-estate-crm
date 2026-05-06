import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_ACCOUNT_ID = "a540905b-7cd7-4dd6-bba0-162c07978bd6";

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

    const first_name = formData.get("first_name") as string;
    const last_name = formData.get("last_name") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const price_range = formData.get("price_range") as string;
    const area = formData.get("area") as string;
    const timeline = formData.get("timeline") as string;
    const working_with_realtor = formData.get(
      "working_with_realtor"
    ) as string;

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
            source: "Home Buyers Guide",
            original_source: "Home Buyers Guide",
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
            source: "Home Buyers Guide",
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

    const CAMPAIGN_ID =
      "de93a220-2ca8-4022-9a33-7f584a0e2799";

    const { data: existingCampaign } = await supabaseAdmin
      .from("contact_campaigns")
      .select("id")
      .eq("contact_id", contactId)
      .eq("campaign_id", CAMPAIGN_ID)
      .maybeSingle();

    if (!existingCampaign) {
      await supabaseAdmin
        .from("contact_campaigns")
        .insert([
          {
            contact_id: contactId,
            campaign_id: CAMPAIGN_ID,
            next_send_at: new Date().toISOString(),
          },
        ]);
    }

    await resend.emails.send({
      from: "info@thefcgroup.ca",
      to: account.owner_email,
      subject: "New Home Buyer Lead",
      html: `
        <h2>New Home Buyer Lead</h2>

        <p><strong>Name:</strong> ${first_name} ${last_name || ""}</p>

        <p><strong>Email:</strong> ${normalizedEmail}</p>

        <p><strong>Phone:</strong> ${phone || "N/A"}</p>

        <p><strong>Price Range:</strong> ${price_range || "N/A"}</p>

        <p><strong>Preferred Area:</strong> ${area || "N/A"}</p>

        <p><strong>Timeline:</strong> ${timeline || "N/A"}</p>

        <p><strong>Working With Realtor:</strong> ${
          working_with_realtor || "N/A"
        }</p>
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
    console.error("HOME BUYERS ERROR:", err);

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
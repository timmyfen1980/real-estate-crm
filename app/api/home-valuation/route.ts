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
  return NextResponse.json({}, { headers: getCorsHeaders(origin) });
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
    const address = formData.get("address") as string;
    const comments = formData.get("comments") as string;

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

    if (!account) throw new Error("Account not found");

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
      // =========================
// AUTO ASSIGN EMAIL CAMPAIGN
// =========================

// Replace with your real campaign ID
const CAMPAIGN_ID = 'ab86b521-d3c8-4acb-8d4d-20e5e973ce03'

// Check if already assigned (prevent duplicates)
const { data: existingCampaign } = await supabaseAdmin
  .from('contact_campaigns')
  .select('id')
  .eq('contact_id', contactId)
  .eq('campaign_id', CAMPAIGN_ID)
  .maybeSingle()

if (!existingCampaign) {
  await supabaseAdmin.from('contact_campaigns').insert([
    {
      contact_id: contactId,
      campaign_id: CAMPAIGN_ID,
      next_send_at: new Date().toISOString(),
    },
  ])
}

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
      // =========================
// AUTO ASSIGN EMAIL CAMPAIGN
// =========================

// Replace with your real campaign ID
const CAMPAIGN_ID = 'ab86b521-d3c8-4acb-8d4d-20e5e973ce03'

// Check if already assigned (prevent duplicates)
const { data: existingCampaign } = await supabaseAdmin
  .from('contact_campaigns')
  .select('id')
  .eq('contact_id', contactId)
  .eq('campaign_id', CAMPAIGN_ID)
  .maybeSingle()

if (!existingCampaign) {
  await supabaseAdmin.from('contact_campaigns').insert([
    {
      contact_id: contactId,
      campaign_id: CAMPAIGN_ID,
      next_send_at: new Date().toISOString(),
    },
  ])
}
    }

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
    address,
    source: "Home Valuation",
    status: "New",
    deal_type: "Seller",
  })
  .select("id")
  .single();

      if (leadError) throw leadError;
      leadId = newLead.id;
    }

    // 🔥 FILE UPLOAD (CORRECT WAY)
    const files = formData.getAll("images") as File[];
    const uploadedUrls: string[] = [];

    for (const file of files) {
      if (!file || file.size === 0) continue;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("account-assets")
        .upload(fileName, buffer, {
  contentType: file.type,
});
      if (uploadError) {
        console.error("UPLOAD ERROR:", uploadError);
        continue;
      }

      const { data } = supabaseAdmin.storage
        .from("account-assets")
        .getPublicUrl(fileName);

      uploadedUrls.push(data.publicUrl);
    }

    // attach images to lead notes
    if (uploadedUrls.length > 0 && leadId) {
      await supabaseAdmin.from("notes").insert({
        lead_id: leadId,
        content: `Uploaded Images:\n${uploadedUrls.join("\n")}`,
      });
    }

    await resend.emails.send({
      from: "info@thefcgroup.ca",
      to: account.owner_email,
      subject: "New Home Valuation Lead",
      html: `
        <h2>New Home Valuation Request</h2>
        <p><strong>Name:</strong> ${first_name} ${last_name || ""}</p>
        <p><strong>Email:</strong> ${normalizedEmail}</p>
        <p><strong>Phone:</strong> ${phone || "N/A"}</p>
        <p><strong>Address:</strong> ${address || "N/A"}</p>
        <p><strong>Comments:</strong> ${comments || "N/A"}</p>
        <p><strong>Images:</strong><br/>${uploadedUrls.join("<br/>")}</p>
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
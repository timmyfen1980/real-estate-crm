import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/magnet-order — order capture for the "Fridge Magnet Maker"
// page (thefcgroup.ca/magnet-maker.html). An agent designs their own
// Important Local Numbers fridge magnet on the website, previews the
// exact print file, and orders. This route saves the finished magnet
// PNG (and the original photo) to the client-documents bucket under
// magnet-orders/, then emails the order to the account owner.

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

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "agent"
  );
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = getCorsHeaders(origin);

  try {
    const formData = await req.formData();

    const agentName = ((formData.get("agent_name") as string) || "").trim();
    const title = ((formData.get("title") as string) || "").trim();
    const person2Name = ((formData.get("person2_name") as string) || "").trim();
    const person2Title = ((formData.get("person2_title") as string) || "").trim();
    const brokerage = ((formData.get("brokerage") as string) || "").trim();
    const phone = ((formData.get("phone") as string) || "").trim();
    const website = ((formData.get("website") as string) || "").trim();
    const email = ((formData.get("email") as string) || "").trim().toLowerCase();
    const quantity = ((formData.get("quantity") as string) || "").trim();
    const town = ((formData.get("town") as string) || "").trim();
    const notes = ((formData.get("notes") as string) || "").trim();
    const backgroundRemoved = ((formData.get("background_removed") as string) || "").trim();

    const magnetFile = formData.get("magnet") as File | null;
    const photoFile = formData.get("photo") as File | null;

    if (!agentName || !email || !magnetFile) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400, headers }
      );
    }

    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("id, owner_user_id, owner_email")
      .eq("id", DEFAULT_ACCOUNT_ID)
      .single();

    if (!account) {
      throw new Error("Account not found");
    }

    const stamp = Date.now();
    const base = `magnet-orders/${stamp}-${slugify(agentName)}`;

    // Save the finished print file.
    const magnetBytes = new Uint8Array(await magnetFile.arrayBuffer());
    const magnetPath = `${base}.png`;
    const { error: magnetError } = await supabaseAdmin.storage
      .from("client-documents")
      .upload(magnetPath, magnetBytes, {
        contentType: "image/png",
        upsert: false,
      });
    if (magnetError) throw magnetError;

    const { data: magnetUrl } = await supabaseAdmin.storage
      .from("client-documents")
      .createSignedUrl(magnetPath, 31536000);

    // Save the original photo too, when one was uploaded.
    let photoUrl = "";
    if (photoFile && photoFile.size > 0) {
      const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
      const photoPath = `${base}-photo.${ext}`;
      const photoBytes = new Uint8Array(await photoFile.arrayBuffer());
      const { error: photoError } = await supabaseAdmin.storage
        .from("client-documents")
        .upload(photoPath, photoBytes, {
          contentType: photoFile.type || "image/jpeg",
          upsert: false,
        });
      if (!photoError) {
        const { data: signed } = await supabaseAdmin.storage
          .from("client-documents")
          .createSignedUrl(photoPath, 31536000);
        photoUrl = signed?.signedUrl || "";
      }
    }

    // Save the order details alongside the files.
    const orderRecord = {
      agent_name: agentName,
      title,
      person2_name: person2Name,
      person2_title: person2Title,
      brokerage,
      phone,
      website,
      email,
      quantity,
      town,
      notes,
      background_removed: backgroundRemoved,
      magnet_path: magnetPath,
      received_at: new Date().toISOString(),
    };
    await supabaseAdmin.storage
      .from("client-documents")
      .upload(
        `${base}.json`,
        new TextEncoder().encode(JSON.stringify(orderRecord, null, 2)),
        { contentType: "application/json", upsert: false }
      );

    const peopleLine = person2Name
      ? `${agentName} (${title || "—"}) and ${person2Name} (${person2Title || "—"})`
      : `${agentName} (${title || "—"})`;

    await resend.emails.send({
      from: "info@thefcgroup.ca",
      to: account.owner_email,
      subject: `New Magnet Order — ${agentName}`,
      html: `
        <h2>New Fridge Magnet Order</h2>

        <p><strong>Agent:</strong> ${peopleLine}</p>

        <p><strong>Brokerage:</strong> ${brokerage || "N/A"}</p>

        <p><strong>Phone (printed):</strong> ${phone || "N/A"}</p>

        <p><strong>Website (printed):</strong> ${website || "N/A"}</p>

        <p><strong>Order email:</strong> ${email}</p>

        <p><strong>Quantity:</strong> ${quantity || "Not specified"}</p>

        <p><strong>Main town:</strong> ${town || "N/A"}</p>

        <p><strong>Background removed in preview:</strong> ${backgroundRemoved || "unknown"}</p>

        <p><strong>Notes:</strong> ${notes || "None"}</p>

        <p><strong>Print file:</strong> <a href="${magnetUrl?.signedUrl || ""}">Download the finished magnet PNG</a></p>

        ${photoUrl ? `<p><strong>Original photo:</strong> <a href="${photoUrl}">Download the uploaded photo</a></p>` : ""}
      `,
    });

    return NextResponse.json(
      {
        success: true,
      },
      {
        headers,
      }
    );
  } catch (err) {
    console.error("MAGNET ORDER ERROR:", err);

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

/* eslint-disable @typescript-eslint/no-explicit-any */
// Syngrafii integration test: takes one document from an offer package
// (default: the rebuilt 928 Black Cherry test package's Form 801),
// uploads it to iinked Sign and creates a signing package addressed to
// Tim alone, sent immediately (state "open"). This is how we learn what
// the signer experience looks like on our untagged OREA PDFs before the
// real send flow is wired into the Offers UI.
// Auth: signed-in session or the agent Bearer secret (same pattern as
// the other /api/offers routes).
//   POST { package_id?, form? } -> { ok, syngrafii_package_id, file_id, doc }

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { synUploadPdf, synCreatePackage } from "@/lib/syngrafii";

const DEFAULT_PACKAGE_ID = "14ce094b-4a93-4418-adbf-7407637f1736"; // 928 Black Cherry test package
const TIM = { firstName: "Tim", lastName: "Fennessey", email: "tim@thefcgroup.ca" };

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
  return !!user;
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const packageId = String(body.package_id || DEFAULT_PACKAGE_ID);
    const wantForm = String(body.form || "801");

    const supabase = serviceClient();
    const { data: pkg, error } = await supabase
      .from("offer_packages")
      .select("id, address, city, documents")
      .eq("id", packageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pkg) {
      return NextResponse.json({ ok: false, error: "Offer package not found." }, { status: 404 });
    }
    const docs: any[] = Array.isArray(pkg.documents) ? pkg.documents : [];
    const doc =
      docs.find((d) => String(d.form || "").includes(wantForm)) || docs[0];
    if (!doc?.path) {
      return NextResponse.json(
        { ok: false, error: "That package has no documents to test with." },
        { status: 400 }
      );
    }

    // Pull the PDF bytes via a signed URL (storage.download() corrupts
    // paths containing spaces — see the Schedule B lesson).
    const { data: signed, error: signErr } = await supabase.storage
      .from("client-documents")
      .createSignedUrl(doc.path, 180);
    if (signErr || !signed?.signedUrl) {
      throw new Error(signErr?.message || "Could not sign the document URL.");
    }
    const fileRes = await fetch(signed.signedUrl);
    if (!fileRes.ok) throw new Error(`Document fetch failed: ${fileRes.status}`);
    const bytes = new Uint8Array(await fileRes.arrayBuffer());

    const filename = doc.filename || "document.pdf";
    const fileId = await synUploadPdf(
      bytes,
      filename,
      `crm-test-${packageId}-${doc.form || "doc"}`
    );

    const created = await synCreatePackage({
      name: `TEST — ${pkg.address || "928 Black Cherry Dr"} — ${filename} (Rea integration test)`,
      type: "concurrent",
      state: "open",
      signers: [TIM],
      documents: [{ fileName: filename, fileId }],
      message:
        "Rea integration test — please open and sign so we can check the signer experience on our forms. Test only, not a real transaction.",
    });

    return NextResponse.json({
      ok: true,
      syngrafii_package_id: created?.packageId || created?.id || null,
      file_id: fileId,
      doc: filename,
      created_response: created,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Syngrafii test failed." },
      { status: 500 }
    );
  }
}

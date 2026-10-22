/* eslint-disable @typescript-eslint/no-explicit-any */
// Syngrafii integration DIAGNOSTIC. First live attempt (2026-10-21)
// created the package shell in Tim's iinked account but no document
// attached, and packages/add answered with a generic error. This route
// isolates the failing step in one run:
//   1. list packages (shows the orphan + its state)
//   2. upload the test PDF, returning the API's full verdict
//      (isConverted / error) instead of just the fileId
//   3. attempt A: create a package referencing the uploaded fileId
//   4. attempt B: create a package with the PDF embedded as base64
//      (documents[].fileData), bypassing the upload reference entirely
// Both attempts are addressed to Tim alone and sent immediately.
// Auth: signed-in session or the agent Bearer secret.
//   POST { package_id?, form? } -> full diagnostic JSON

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import {
  synUploadPdf,
  synCreatePackage,
  synListPackages,
  synPackageStatus,
  synDownloadDocument,
} from "@/lib/syngrafii";

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

async function attempt(label: string, body: any): Promise<any> {
  try {
    const created = await synCreatePackage(body);
    return { label, ok: true, response: created };
  } catch (e: any) {
    return { label, ok: false, error: e?.message || String(e) };
  }
}

// Return-leg proof: GET ?pkg=<syngrafii packageId> -> status, then
// download the executed PDF + the Compliance Audit Certificate for the
// first document and report their sizes / PDF magic — no storing.
export async function GET(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
    }
    const pkgId = req.nextUrl.searchParams.get("pkg");
    if (!pkgId) {
      return NextResponse.json({ ok: false, error: "pkg query param required." }, { status: 400 });
    }
    const status = await synPackageStatus(pkgId);
    const docs: any[] = Array.isArray(status?.documents) ? status.documents : [];
    const signers: any[] = Array.isArray(status?.signers) ? status.signers : [];
    const out: any = {
      ok: true,
      packageId: status?.packageId || pkgId,
      state: status?.state,
      documents: docs.map((d: any) => ({ documentId: d.documentId, state: d.state })),
      signers: signers.map((s: any) => ({
        name: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
        hasSigned: s.hasSigned ?? null,
      })),
      downloads: {},
    };
    const firstDoc = docs[0]?.documentId;
    if (firstDoc) {
      for (const version of ["current", "executed", "cac"]) {
        try {
          const bytes = await synDownloadDocument(pkgId, firstDoc, version);
          const head = Buffer.from(bytes.slice(0, 5)).toString("latin1");
          out.downloads[version] = { bytes: bytes.length, is_pdf: head === "%PDF-" };
          // The 'current' bytes come back in full so the caller can
          // inspect exactly what iinked is holding (fields? layout?).
          if (version === "current") {
            out.current_b64 = Buffer.from(bytes).toString("base64");
          }
        } catch (e: any) {
          out.downloads[version] = { error: e?.message || String(e) };
        }
      }
    }
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Status check failed." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const diag: any = { steps: [] };
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const packageId = String(body.package_id || DEFAULT_PACKAGE_ID);
    const wantForm = String(body.form || "801");

    // 1. What does the account currently hold?
    try {
      const list = await synListPackages();
      const arr = Array.isArray(list) ? list : list?.packages || list?.items || [];
      diag.steps.push({
        step: "list_packages",
        count: Array.isArray(arr) ? arr.length : null,
        packages: (Array.isArray(arr) ? arr : []).slice(0, 5).map((p: any) => ({
          packageId: p.packageId || p.id,
          name: p.name,
          state: p.state,
          documents: Array.isArray(p.documents) ? p.documents.length : null,
        })),
        raw_keys: list && typeof list === "object" ? Object.keys(list) : null,
      });
    } catch (e: any) {
      diag.steps.push({ step: "list_packages", error: e?.message || String(e) });
    }

    // 2. Fetch the test document from the offer package.
    const supabase = serviceClient();
    const { data: pkg, error } = await supabase
      .from("offer_packages")
      .select("id, address, city, documents")
      .eq("id", packageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pkg) {
      return NextResponse.json({ ok: false, error: "Offer package not found.", diag }, { status: 404 });
    }
    const docs: any[] = Array.isArray(pkg.documents) ? pkg.documents : [];
    const doc = docs.find((d) => String(d.form || "").includes(wantForm)) || docs[0];
    if (!doc?.path) {
      return NextResponse.json({ ok: false, error: "That package has no documents.", diag }, { status: 400 });
    }
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
    diag.doc = { filename, bytes: bytes.length };

    // 3. Upload — keep the full verdict this time.
    const file = await synUploadPdf(bytes, filename, `crm-diag-${packageId}-${doc.form || "doc"}`);
    diag.steps.push({ step: "upload", file });
    const fileId = file?.fileId;

    const base = {
      type: "concurrent",
      state: "open",
      signers: [TIM],
      message: "Rea integration diagnostic — test only, not a real transaction.",
    };

    // 4. Attempt A — reference the uploaded file.
    if (fileId) {
      diag.steps.push(
        await attempt("add_by_fileId", {
          ...base,
          name: `TEST A (fileId) — ${filename}`,
          documents: [{ fileName: filename, fileId }],
        })
      );
    }

    // 5. Attempt B — embed the PDF directly as base64.
    diag.steps.push(
      await attempt("add_by_fileData", {
        ...base,
        name: `TEST B (fileData) — ${filename}`,
        documents: [
          { fileName: filename, fileData: Buffer.from(bytes).toString("base64") },
        ],
      })
    );

    diag.ok = diag.steps.some((s: any) => s.ok && String(s.step).startsWith("add"));
    return NextResponse.json(diag);
  } catch (e: any) {
    diag.ok = false;
    diag.error = e?.message || "Diagnostic failed.";
    return NextResponse.json(diag, { status: 500 });
  }
}

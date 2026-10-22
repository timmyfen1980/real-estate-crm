/* eslint-disable @typescript-eslint/no-explicit-any */
// Syngrafii iinked Sign API client (server-side only).
// Docs: https://docs.iinkedsign.com (API v4). Canadian instance.
// Auth: the organization API key rides in a custom `api_key` header;
// the key lives only in the SYNGRAFII_API_KEY env var.

const BASE = "https://sign.syngrafii.ca/api/v1";

function apiKey(): string {
  const k = process.env.SYNGRAFII_API_KEY;
  if (!k) throw new Error("SYNGRAFII_API_KEY is not set.");
  return k;
}

async function readBody(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function apiError(res: Response, data: any, what: string): Error {
  const detail =
    data?.message || data?.error || data?.raw || `HTTP ${res.status}`;
  return new Error(`Syngrafii ${what} failed: ${detail}`);
}

// Upload one PDF. The docs show a multipart body whose single part
// carries only a filename in its Content-Disposition (no field name) and
// the raw bytes — built by hand here to match that shape exactly.
// Returns the API's file record (fileId, isConverted, error, ...) so
// callers can see the conversion verdict, not just the id.
export async function synUploadPdf(
  bytes: Uint8Array,
  filename: string,
  externalId?: string
): Promise<any> {
  const boundary = `----rea${Date.now().toString(16)}${Math.random()
    .toString(16)
    .slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
    "utf8"
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, Buffer.from(bytes), tail]);

  const qs = externalId ? `?externalId=${encodeURIComponent(externalId)}` : "";
  const res = await fetch(`${BASE}/files/upload${qs}`, {
    method: "POST",
    headers: {
      api_key: apiKey(),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  const data = await readBody(res);
  if (!res.ok) throw apiError(res, data, "file upload");
  const file = Array.isArray(data?.files) ? data.files[0] : null;
  if (!file?.fileId) {
    throw new Error(
      `Syngrafii file upload returned no fileId: ${JSON.stringify(data).slice(0, 400)}`
    );
  }
  if (file.isInvalid || file.isNotSupported) {
    throw new Error(
      `Syngrafii rejected the file: ${file.error || file.message || "invalid file"}`
    );
  }
  return file;
}

export async function synListPackages(): Promise<any> {
  const res = await fetch(`${BASE}/packages/list`, {
    headers: { api_key: apiKey() },
  });
  const data = await readBody(res);
  if (!res.ok) throw apiError(res, data, "package list");
  return data;
}

export interface SynSigner {
  firstName: string;
  lastName: string;
  email: string;
  signerTag?: string;
  mobileNumber?: string;
}

export interface SynCreatePackage {
  name: string;
  type?: string; // "concurrent" | "Sequential" | "Counterpart" | ...
  state?: string; // "open" (send now) | "draft" | "add" | "select"
  signers: SynSigner[];
  documents: { fileName: string; fileId?: string; fileData?: string }[];
  message?: string;
  generateEditLink?: boolean;
  generateSignerLinks?: boolean;
  externalData?: string;
}

// Creates a package (documents + signers in one call). With state
// "open" (the API default) iinked emails the signers immediately.
// Returns the full response — callers read .packageId.
export async function synCreatePackage(body: SynCreatePackage): Promise<any> {
  const res = await fetch(`${BASE}/packages/add`, {
    method: "POST",
    headers: { api_key: apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readBody(res);
  if (!res.ok) throw apiError(res, data, "package create");
  return data;
}

export async function synSendPackage(packageId: string): Promise<any> {
  const res = await fetch(`${BASE}/packages/send`, {
    method: "POST",
    headers: { api_key: apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ packageId }),
  });
  const data = await readBody(res);
  if (!res.ok) throw apiError(res, data, "package send");
  return data;
}

export async function synPackageStatus(packageId: string): Promise<any> {
  const res = await fetch(
    `${BASE}/packages/${encodeURIComponent(packageId)}/status`,
    { headers: { api_key: apiKey() } }
  );
  const data = await readBody(res);
  if (!res.ok) throw apiError(res, data, "package status");
  return data;
}

// version: "executed" (signed PDF) | "cac" (Compliance Audit
// Certificate) | "current" | a revisionId.
export async function synDownloadDocument(
  packageId: string,
  documentId: string,
  version: string
): Promise<Uint8Array> {
  const res = await fetch(
    `${BASE}/packages/${encodeURIComponent(packageId)}/documents/${encodeURIComponent(
      documentId
    )}/pdf/${encodeURIComponent(version)}/download`,
    { headers: { api_key: apiKey() } }
  );
  if (!res.ok) {
    const data = await readBody(res);
    throw apiError(res, data, "document download");
  }
  return new Uint8Array(await res.arrayBuffer());
}

// A short-lived secure link into the package editor — opens iinked
// already authenticated (no login). Mint it at click time only.
export async function synEditLink(packageId: string): Promise<string> {
  const res = await fetch(
    `${BASE}/packages/${encodeURIComponent(packageId)}/link/edit`,
    { method: "POST", headers: { api_key: apiKey() } }
  );
  const data = await readBody(res);
  if (!res.ok) throw apiError(res, data, "edit link");
  if (!data?.link) {
    throw new Error(`Syngrafii edit link missing: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data.link as string;
}

// Register a webhook endpoint; the response carries the endpoint
// secret used to verify callbacks. Called once (setup action).
export async function synRegisterEndpoint(url: string, name: string): Promise<any> {
  const res = await fetch(`${BASE}/events/endpoints/set`, {
    method: "POST",
    headers: { api_key: apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ url, name, delete: false }),
  });
  const data = await readBody(res);
  if (!res.ok) throw apiError(res, data, "webhook registration");
  return data;
}

// ---------------------------------------------------------------------------
// Webhook settings (endpoint id + secret) live in a storage JSON only
// the service role can read — the secret never leaves the server.
// ---------------------------------------------------------------------------

export const SYN_SETTINGS_PATH = "system/syngrafii-webhook.json";
export const SYN_WEBHOOK_URL = "https://crm.thefcgroup.ca/api/syngrafii/webhook";
const SYN_BUCKET = "client-documents";

export async function synReadSettings(supabase: any): Promise<any | null> {
  const { data, error } = await supabase.storage
    .from(SYN_BUCKET)
    .download(SYN_SETTINGS_PATH);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

export async function synWriteSettings(supabase: any, settings: any): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(settings, null, 2));
  const { error } = await supabase.storage
    .from(SYN_BUCKET)
    .upload(SYN_SETTINGS_PATH, bytes, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Flattening — Tim's rule (2026-10-21): iinked's engine re-renders live
// AcroForm appearances and shifts filled values off their lines. The
// copy sent for signing is flattened (values printed into the page, no
// live fields left to re-draw); the CRM master stays editable.
// Documents with no form fields (scans) pass through untouched.
// ---------------------------------------------------------------------------

export async function flattenPdfBytes(
  bytes: Uint8Array
): Promise<{ bytes: Uint8Array; flattened: boolean }> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    if (!form.getFields().length) return { bytes, flattened: false };
    form.flatten();
    const out = await doc.save();
    return { bytes: out, flattened: true };
  } catch {
    return { bytes, flattened: false };
  }
}

// ---------------------------------------------------------------------------
// Filing an executed package back into the CRM: for every document that
// went out, download the signed PDF + its Compliance Audit Certificate
// from iinked and add them to the package's documents; mark the
// originals signed; flip the package status to 'signed'. Idempotent —
// a document already filed (same syn_doc id) is skipped, so webhook
// retries and manual status checks can both call it safely.
// ---------------------------------------------------------------------------

export async function fileExecutedPackage(
  supabase: any,
  pkg: any,
  synPackageId?: string
): Promise<{ filed: string[] }> {
  const filed: string[] = [];
  // A package can be sent to iinked several times over its life — the
  // offer itself first, then a Notice of Fulfillment or Waiver days
  // later (Tim, 2026-10-22). Every send is recorded in
  // deal.syngrafii_sends; deal.syngrafii mirrors the latest send.
  // Resolve which send executed: the one the caller names, else latest.
  const sends: any[] = Array.isArray(pkg?.deal?.syngrafii_sends)
    ? pkg.deal.syngrafii_sends
    : pkg?.deal?.syngrafii
      ? [pkg.deal.syngrafii]
      : [];
  const syn = synPackageId
    ? sends.find((s: any) => s?.package_id === synPackageId)
    : pkg?.deal?.syngrafii;
  if (!syn?.package_id || !Array.isArray(syn.docs) || !syn.docs.length) {
    return { filed };
  }
  const docs: any[] = Array.isArray(pkg.documents) ? [...pkg.documents] : [];
  // Only an executed send carrying the Agreement itself flips the
  // package to 'signed' — a later fulfillment/waiver send must not
  // disturb the status of an already-signed deal.
  const isApsSend = syn.docs.some((sent: any) => {
    const orig = (pkg.documents || []).find((d: any) => d.path === sent.path);
    return orig && ["100", "101", "102"].includes(String(orig.form));
  });
  const stamp = Date.now();
  for (const sent of syn.docs) {
    if (!sent?.document_id || !sent?.path) continue;
    if (docs.some((d) => d.syn_doc === sent.document_id && d.form === "signed")) {
      continue; // already filed
    }
    const signedBytes = await synDownloadDocument(
      syn.package_id,
      sent.document_id,
      "executed"
    );
    const base = String(sent.filename || "document.pdf").replace(/\.pdf$/i, "");
    const signedName = `${base} (Signed).pdf`;
    const signedPath = `offers/${pkg.id}/signed/${stamp}-${signedName.replace(/[^\w.\- ]+/g, "_")}`;
    const { error: upErr } = await supabase.storage
      .from(SYN_BUCKET)
      .upload(signedPath, signedBytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(upErr.message);
    docs.push({
      form: "signed",
      filename: signedName,
      path: signedPath,
      signed: true,
      syn_doc: sent.document_id,
      added_at: new Date().toISOString(),
    });
    filed.push(signedName);
    try {
      const cacBytes = await synDownloadDocument(syn.package_id, sent.document_id, "cac");
      const cacName = `Audit Certificate - ${base}.pdf`;
      const cacPath = `offers/${pkg.id}/signed/${stamp}-CAC-${base.replace(/[^\w.\- ]+/g, "_")}.pdf`;
      const { error: cacErr } = await supabase.storage
        .from(SYN_BUCKET)
        .upload(cacPath, cacBytes, { contentType: "application/pdf", upsert: false });
      if (!cacErr) {
        docs.push({
          form: "cac",
          filename: cacName,
          path: cacPath,
          signed: true,
          syn_doc: sent.document_id,
          added_at: new Date().toISOString(),
        });
        filed.push(cacName);
      }
    } catch {
      // The signed PDF is the essential artifact; a missing CAC is noted
      // by its absence and can be fetched manually from iinked.
    }
    // Mark the original document signed.
    for (const d of docs) {
      if (d.path === sent.path) d.signed = true;
    }
  }
  if (filed.length) {
    const stamp2 = new Date().toISOString();
    const executedSyn = { ...syn, state: "executed", filed_at: stamp2 };
    const deal: any = { ...(pkg.deal || {}) };
    deal.syngrafii_sends = sends.map((s: any) =>
      s?.package_id === syn.package_id ? executedSyn : s
    );
    if (deal.syngrafii?.package_id === syn.package_id) {
      deal.syngrafii = executedSyn;
    }
    const { error } = await supabase
      .from("offer_packages")
      .update({
        documents: docs,
        status: isApsSend ? "signed" : pkg.status || "out",
        deal,
      })
      .eq("id", pkg.id);
    if (error) throw new Error(error.message);
  }
  return { filed };
}

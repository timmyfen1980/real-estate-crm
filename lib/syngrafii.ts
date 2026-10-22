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
// Returns the fileId to reference from packages/add.
export async function synUploadPdf(
  bytes: Uint8Array,
  filename: string,
  externalId?: string
): Promise<string> {
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
  return file.fileId as string;
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
  documents: { fileName: string; fileId: string }[];
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

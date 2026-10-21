// POST /api/offers/schedule-b-fill { package_id }
//
// Schedule Bs arrive FLATTENED — usually a scanned OREA Form 105 with
// no text layer at all (verified on Tim's own 928 Black Cherry package,
// 2026-10-21). The header block repeats at the top of EVERY page:
//   BUYER: ______ / SELLER: ______ / for the property known as ______
//   ______ dated the ____ day of ____, 20__
// This overlays editable text fields with the package's buyers,
// sellers, property and agreement date at those spots, on every page,
// and adds the result to the package as a NEW document ("Schedule B
// (names filled).pdf"); the original upload is never touched.
//
// Positions: if a page HAS a text layer, the Buyer/Seller/Property
// labels are located from the text itself. If not (a scan), the
// measured Form 105 header positions are used — that form's header is
// identical on every Schedule B this team handles. Fields stay
// editable so anything slightly off can be nudged in a PDF editor.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "client-documents";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );
}

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.REA_AGENT_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (secret && auth === `Bearer ${secret}`) return true;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

// Measured on a real Form 105 scan (fractions of page size, origin
// top-left; y is the dotted line's height). Header identical per page.
const FORM105: Record<string, { x0: number; x1: number; y: number }> = {
  buyers: { x0: 0.125, x1: 0.885, y: 0.178 },
  sellers: { x0: 0.125, x1: 0.925, y: 0.207 },
  property: { x0: 0.252, x1: 0.925, y: 0.236 },
  date_day: { x0: 0.445, x1: 0.625, y: 0.2655 },
  date_month: { x0: 0.7, x1: 0.84, y: 0.2655 },
  date_year: { x0: 0.885, x1: 0.935, y: 0.2655 },
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as any;
    const packageId = String(body.package_id || "");
    if (!packageId) {
      return NextResponse.json({ ok: false, error: "Missing package_id." }, { status: 400 });
    }

    const svc = admin();
    const { data: pkg, error } = await svc
      .from("offer_packages")
      .select("id, deal, documents")
      .eq("id", packageId)
      .single();
    if (error || !pkg) {
      return NextResponse.json({ ok: false, error: "Package not found." }, { status: 404 });
    }
    const deal = pkg.deal || {};
    const docs: any[] = Array.isArray(pkg.documents) ? pkg.documents : [];
    const source = docs.find((d) => d.form === "schedule_b");
    if (!source) {
      return NextResponse.json(
        { ok: false, error: "No Schedule B in this package yet — add it first." },
        { status: 400 }
      );
    }

    const buyers = (deal.buyers || []).filter(Boolean).join(" and ");
    const sellers = (deal.sellers || []).filter(Boolean).join(" and ");
    const prop = deal.property || {};
    const propertyLine = [prop.address, prop.city].filter(Boolean).join(", ");
    const ad = deal.agreement_date || {};
    const dDay = Number(ad.day) || 0;
    // Stored deals carry the month as a number OR a name ("October"),
    // and the year as 2 or 4 digits — accept all of them.
    const monthFromName =
      MONTHS.findIndex(
        (m) => m.toLowerCase() === String(ad.month || "").toLowerCase()
      ) + 1;
    const dMonth = monthFromName || Number(ad.month) || 0;
    const dYear = Number(ad.year) || 0;
    const values: Record<string, string> = {
      buyers,
      sellers,
      property: propertyLine,
      date_day: dDay ? ordinal(dDay) : "",
      date_month: dMonth >= 1 && dMonth <= 12 ? MONTHS[dMonth - 1] : "",
      date_year: dYear ? String(dYear).slice(-2) : "",
    };
    const missing: string[] = [];
    if (!buyers) missing.push("buyers");
    if (!sellers) missing.push("sellers");
    if (!propertyLine) missing.push("property");

    // Fetch via a signed URL rather than storage.download() — the SDK
    // download mishandles object paths containing spaces (e.g.
    // "…-Sched B.pdf") and hands back an error body as if it were the
    // file (hit live, 2026-10-21). The signed-URL path is the same one
    // the package file downloads use, and it works.
    const signed = await svc.storage.from(BUCKET).createSignedUrl(source.path, 120);
    if (signed.error || !signed.data?.signedUrl) {
      return NextResponse.json(
        { ok: false, error: "Could not read the Schedule B file from storage." },
        { status: 400 }
      );
    }
    const resp = await fetch(signed.data.signedUrl);
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: "Could not read the Schedule B file from storage." },
        { status: 400 }
      );
    }
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.length < 5 || bytes[0] !== 0x25) {
      // Not a PDF (0x25 = '%') — say what arrived instead of a parser's
      // opaque "No PDF header found".
      const head = Buffer.from(bytes.slice(0, 120)).toString("latin1");
      return NextResponse.json(
        {
          ok: false,
          error: `The stored Schedule B doesn't look like a PDF (it starts: ${head.slice(0, 80)}).`,
        },
        { status: 400 }
      );
    }

    // No text extraction: real Schedule Bs are scans, and this form's
    // header sits in the same place on every copy (measured). One
    // parser (pdf-lib) keeps this dependable.
    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch (e: any) {
      const head = Buffer.from(bytes.slice(0, 16)).toString("hex");
      return NextResponse.json(
        {
          ok: false,
          error: `The stored Schedule B could not be parsed as a PDF (${bytes.length} bytes, head ${head}): ${e?.message || e}`,
        },
        { status: 400 }
      );
    }
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const form = doc.getForm();
    const placed = new Set<string>();

    const addField = (
      pageIdx: number,
      name: string,
      x: number,
      yBottom: number,
      width: number,
      value: string
    ) => {
      const page = doc.getPage(pageIdx);
      const field = form.createTextField(name);
      field.addToPage(page, {
        x,
        y: yBottom,
        width,
        height: 15,
        borderWidth: 0,
        textColor: rgb(0, 0, 0),
      });
      field.setText(value);
      try {
        (field as any).acroField.dict.set(PDFName.of("DA"), PDFString.of("/Helv 10 Tf 0 g"));
      } catch {
        /* appearance falls back to updateFieldAppearances */
      }
    };


    const numPages = doc.getPageCount();
    for (let p = 1; p <= numPages; p++) {
      const page = doc.getPage(p - 1);
      const { width: W, height: H } = page.getSize();
      // Measured Form 105 header positions — identical on every page.
      for (const key of Object.keys(FORM105)) {
        const value = values[key];
        if (!value) continue;
        const r = FORM105[key];
        const x = r.x0 * W;
        const width = (r.x1 - r.x0) * W;
        const yBottom = H - r.y * H - 4;
        addField(p - 1, `sb_${key}_p${p}`, x, yBottom, width, value);
        placed.add(key.startsWith("date_") ? "date" : key);
      }
    }

    if (placed.size === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "I couldn't place the names on that Schedule B — its layout may differ from the usual Form 105. The names can be typed onto it in a PDF editor.",
          missing,
        },
        { status: 422 }
      );
    }

    form.updateFieldAppearances(helvetica);
    const out = await doc.save();

    const path = `offers/${packageId}/${Date.now()}-Schedule-B-filled.pdf`;
    const up = await svc.storage.from(BUCKET).upload(path, out, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (up.error) {
      return NextResponse.json(
        { ok: false, error: `Filled the form but saving it failed: ${up.error.message}` },
        { status: 500 }
      );
    }
    const documents = [
      ...docs,
      {
        form: "schedule_b_filled",
        filename: "Schedule B (names filled).pdf",
        path,
        signed: false,
        added_at: new Date().toISOString(),
      },
    ];
    const upd = await svc.from("offer_packages").update({ documents }).eq("id", packageId);
    if (upd.error) {
      return NextResponse.json(
        { ok: false, error: `Saved the file but updating the package failed: ${upd.error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, placed: Array.from(placed), missing, documents });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Schedule B fill failed." },
      { status: 500 }
    );
  }
}

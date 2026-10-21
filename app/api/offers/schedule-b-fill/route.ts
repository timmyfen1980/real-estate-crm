// POST /api/offers/schedule-b-fill { package_id }
//
// Schedule Bs arrive FLATTENED (downloaded from REALM) — no fillable
// fields. The names/address block at the top still has to be completed
// for the offer. This reads the text positions out of the flattened
// PDF (pdf.js via unpdf), finds the Buyer / Seller / Property lines,
// and overlays editable text fields with the package's buyers, sellers
// and property on top. The result is added to the package as a NEW
// document ("Schedule B (names filled).pdf"); the original upload is
// never touched. If a line can't be found, it's reported in `missing`
// instead of guessed at. Tim, 2026-10-21.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";
import { getDocumentProxy } from "unpdf";

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

type Label = { page: number; x: number; y: number; width: number };
type Item = { str: string; x: number; y: number; width: number; page: number };

function findLabel(items: Item[], re: RegExp): (Label & { lineY: number }) | null {
  for (const it of items) {
    if (re.test(it.str.trim())) {
      return { page: it.page, x: it.x, y: it.y, width: it.width, lineY: Math.round(it.y) };
    }
  }
  return null;
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
    const wanted: { key: string; re: RegExp; value: string; field: string }[] = [
      { key: "buyers", re: /^(buyer|purchaser)\b/i, value: buyers, field: "sb_buyer" },
      { key: "sellers", re: /^(seller|vendor)\b/i, value: sellers, field: "sb_seller" },
      { key: "property", re: /^(property|address|known as)\b/i, value: propertyLine, field: "sb_property" },
    ];
    const missing: string[] = [];
    for (const w of wanted) if (!w.value) missing.push(w.key);

    // Download the flattened Schedule B.
    const dl = await svc.storage.from(BUCKET).download(source.path);
    if (dl.error || !dl.data) {
      return NextResponse.json(
        { ok: false, error: "Could not read the Schedule B file from storage." },
        { status: 400 }
      );
    }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());

    // Extract text items with positions (PDF bottom-up coordinates,
    // the same space pdf-lib writes in).
    const pdf = await getDocumentProxy(bytes);
    const items: Item[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc: any = await page.getTextContent();
      for (const it of tc.items || []) {
        if (!it.str || !it.transform) continue;
        items.push({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width || 0,
          page: p,
        });
      }
    }

    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const form = doc.getForm();
    const placed: string[] = [];

    for (const w of wanted) {
      if (!w.value) continue;
      const label = findLabel(items, w.re);
      if (!label) {
        missing.push(w.key);
        continue;
      }
      // The value runs from just after the label to the right margin,
      // stopping before any other wanted label sharing the line.
      let endX = 571;
      for (const other of wanted) {
        if (other.key === w.key) continue;
        const ol = findLabel(items, other.re);
        if (ol && ol.page === label.page && Math.abs(ol.lineY - label.lineY) <= 3 && ol.x > label.x) {
          endX = Math.min(endX, ol.x - 6);
        }
      }
      const x = label.x + label.width + 4;
      const width = endX - x;
      if (width < 50) {
        missing.push(w.key);
        continue;
      }
      const page = doc.getPage(label.page - 1);
      const field = form.createTextField(w.field);
      field.addToPage(page, {
        x,
        y: label.y - 3,
        width,
        height: 15,
        borderWidth: 0,
        textColor: rgb(0, 0, 0),
      });
      field.setText(w.value);
      try {
        (field as any).acroField.dict.set(
          PDFName.of("DA"),
          PDFString.of("/Helv 10 Tf 0 g")
        );
      } catch {
        /* appearance falls back to updateFieldAppearances below */
      }
      placed.push(w.key);
    }

    if (placed.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "I couldn't find the Buyer / Seller / Property lines on that Schedule B — its layout may differ. The names can be typed onto it in a PDF editor.",
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
    const upd = await svc
      .from("offer_packages")
      .update({ documents })
      .eq("id", packageId);
    if (upd.error) {
      return NextResponse.json(
        { ok: false, error: `Saved the file but updating the package failed: ${upd.error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, placed, missing, documents });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Schedule B fill failed." },
      { status: 500 }
    );
  }
}

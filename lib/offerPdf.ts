/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/offerPdf.ts — editable-PDF offer generation.
//
// Port of the Python offer engine (offer_engine.py) with one deliberate
// difference: it fills the OREA templates' own AcroForm fields — creating
// real fields where the blank has none — so the PDFs it produces stay
// EDITABLE. Nothing is flattened. The only drawing is the footer
// page-count fix (printed text, cover-and-redraw) and only when Schedule A
// continuation pages change the total.
//
// Geometry constants are the engine's, measured on the official blanks
// (Form 100 Rev 2024, 612x792 pt pages). Template rects are top-left
// origin; pdf-lib is bottom-left — rectTL converts.

import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";
import type { PDFFont, PDFForm, PDFPage } from "pdf-lib";
import mapping100 from "./fieldMapping100.json";
import mapping801 from "./fieldMapping801.json";

const PAGE_H = 792;

const TOP_DATE_WIDGETS: Record<string, string> = {
  day: "cccccccccccccc",
  month: "ccc",
  year: "cccc",
};
const HST_RECT = [58, 651, 216, 664];
const HST_TEXT: Record<string, string> = {
  in_addition: "In addition to the Purchase Price",
  included: "Included in the Purchase Price",
};
const REQ_DATE_POS: Record<string, [number, number]> = {
  day: [273, 44],
  month: [333, 44],
  year: [486, 44],
};

// Schedule A (page 6) geometry
const SCHED_X0 = 60;
const SCHED_X1 = 552;
const SCHED_Y_TOP = 249; // field top (text area starts ~262)
const SCHED_Y_END = 648;
const SCHED_FONT_SIZE = 9.5;
const SCHED_LEADING = 13.5;
const SCHED_LINES_PER_PAGE = Math.floor((SCHED_Y_END - 262) / SCHED_LEADING); // 28
const SCHED_HEADER = {
  buyers: [77, 132, 560, 146],
  sellers: [77, 155, 560, 169],
  property: [145, 178, 571, 192],
  day: [264, 201, 302, 215],
  month: [325, 201, 480, 215],
  year: [537, 201, 571, 215],
};

// Footer (printed): "Page" x530, pagenum ~[548..557], total ~[567..574], line y 756..770
const FOOTER_PAGENUM_RECT = [546, 754, 559, 772];
const FOOTER_TOTAL_RECT = [563, 754, 576, 772];
const FOOTER_TEXT_X = { pagenum: 550, total: 567 };
const FOOTER_TEXT_Y = 25; // pdf-lib baseline

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

export function numToWords(n: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
    "Eighty", "Ninety",
  ];
  const u100 = (x: number): string =>
    x < 20
      ? ones[x]
      : tens[Math.floor(x / 10)] + (x % 10 === 0 ? "" : "-" + ones[x % 10]);
  const u1000 = (x: number): string =>
    x >= 100
      ? ones[Math.floor(x / 100)] +
        " Hundred" +
        (x % 100 === 0 ? "" : " " + u100(x % 100))
      : u100(x);
  let v = Math.trunc(n);
  if (v === 0) return "Zero";
  const parts: string[] = [];
  for (const [div, nm] of [
    [1000000, "Million"],
    [1000, "Thousand"],
  ] as [number, string][]) {
    if (v >= div) {
      parts.push(u1000(Math.floor(v / div)) + " " + nm);
      v %= div;
    }
  }
  if (v) parts.push(u1000(v));
  return parts.join(" ");
}

export function fmtMoney(n: number): string {
  const v = Number(n);
  if (Number.isInteger(v)) return v.toLocaleString("en-CA");
  return v.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function req(deal: any, path: string, missing: string[]): any {
  let cur = deal;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in cur) cur = cur[part];
    else {
      missing.push(path);
      return null;
    }
  }
  if (cur === null || cur === undefined || cur === "" || (Array.isArray(cur) && cur.length === 0)) {
    missing.push(path);
    return null;
  }
  return cur;
}

function reqDate(deal: any, path: string, missing: string[]): void {
  req(deal, path, missing);
  for (const p of ["day", "month", "year"]) req(deal, `${path}.${p}`, missing);
}

// Clause selection is resolved by the caller (clause library), so the
// engine's 'clauses' requirement is intentionally not repeated here; the
// caller validates unresolved clause blanks instead.
export function validateDeal(deal: any): string[] {
  const missing: string[] = [];
  req(deal, "buyers", missing);
  req(deal, "sellers", missing);
  req(deal, "property.address", missing);
  req(deal, "property.city", missing);
  req(deal, "property.legal_description", missing);
  reqDate(deal, "agreement_date", missing);
  req(deal, "price", missing);
  req(deal, "deposit", missing);
  req(deal, "deposit_due", missing);
  req(deal, "deposit_holder", missing);
  req(deal, "irrevocable.by", missing);
  req(deal, "irrevocable.time", missing);
  reqDate(deal, "irrevocable.date", missing);
  reqDate(deal, "completion_date", missing);
  reqDate(deal, "title_search_date", missing);
  req(deal, "hst", missing);
  if (deal?.hst && !HST_TEXT[deal.hst]) {
    missing.push('hst (must be "in_addition" or "included")');
  }
  return missing;
}

export function validate801(deal: any): string[] {
  const missing: string[] = [];
  req(deal, "buyers", missing);
  req(deal, "sellers", missing);
  req(deal, "property.address", missing);
  req(deal, "property.city", missing);
  reqDate(deal, "agreement_date", missing);
  req(deal, "irrevocable.time", missing);
  reqDate(deal, "irrevocable.date", missing);
  req(deal, "selling_brokerage.brokerage", missing);
  req(deal, "selling_brokerage.agent", missing);
  req(deal, "listing_brokerage.brokerage", missing);
  req(deal, "listing_brokerage.agent", missing);
  req(deal, "submitted.via", missing);
  req(deal, "submitted.time", missing);
  reqDate(deal, "submitted.date", missing);
  if (deal?.counter) {
    req(deal, "counter.buyers", missing);
    req(deal, "counter.submitted.via", missing);
    req(deal, "counter.submitted.time", missing);
    reqDate(deal, "counter.submitted.date", missing);
    req(deal, "counter.irrevocable.time", missing);
    reqDate(deal, "counter.irrevocable.date", missing);
  }
  return missing;
}

// ---------------------------------------------------------------------------
// field plumbing
// ---------------------------------------------------------------------------

function rectTL(r: number[]) {
  return { x: r[0], y: PAGE_H - r[3], width: r[2] - r[0], height: r[3] - r[1] };
}

function setFieldFontSize(form: PDFForm, name: string, size: number) {
  try {
    const field: any = form.getTextField(name);
    field.acroField.dict.set(
      PDFName.of("DA"),
      PDFString.of(`/Helv ${size} Tf 0 g`)
    );
  } catch {
    // field may not exist; caller falls back to creating it
  }
}

function setExistingField(form: PDFForm, rawName: string, value: string): boolean {
  try {
    form.getTextField(rawName).setText(value ?? "");
    return true;
  } catch {
    return false;
  }
}

let createdCount = 0;
function createField(
  doc: PDFDocument,
  form: PDFForm,
  page: PDFPage,
  name: string,
  rectTop: number[],
  value: string,
  opts: { size?: number; multiline?: boolean } = {}
): void {
  const unique = `${name}_${createdCount++}`;
  const field = form.createTextField(unique);
  if (opts.multiline) field.enableMultiline();
  const r = rectTL(rectTop);
  field.addToPage(page, {
    ...r,
    borderWidth: 0,
    textColor: rgb(0, 0, 0),
  });
  setFieldFontSize(form, unique, opts.size ?? 10);
  field.setText(value ?? "");
}

// A mapped field: prefer the template's own widget; if the raw name is not
// in the form, create a field over the mapped rect so the value still lands.
function mappedField(
  doc: PDFDocument,
  form: PDFForm,
  sem: string,
  value: string,
  size = 10
): void {
  const m = (mapping100 as any)[sem];
  if (!m) return;
  if (m.blank && setExistingField(form, m.blank, value)) {
    setFieldFontSize(form, m.blank, size);
    return;
  }
  // find the page whose widgets/area matches — mapped rects are page-local;
  // the mapping does not carry a page, so use the doc search by rect page
  // hints: pages are tried in order of the known layout below.
  const pageIdx = PAGE_OF_SEM[sem] ?? 0;
  createField(doc, form, doc.getPage(pageIdx), `rea_${sem}`, m.rect, value, { size });
}

// Which page each mapped semantic lives on (Form 100 layout).
const PAGE_OF_SEM: Record<string, number> = {
  txtp_propincludes: 1,
  txtp_propexcludes: 1,
  txtp_LeasedItems: 1,
};

function mappedPair(
  doc: PDFDocument,
  form: PDFForm,
  semA: string,
  semB: string,
  value: string
): void {
  const a = (mapping100 as any)[semA];
  const b = (mapping100 as any)[semB];
  if (a?.blank && setExistingField(form, a.blank, value)) {
    setFieldFontSize(form, a.blank, 10);
    return;
  }
  if (a && b) {
    const merged = [
      Math.min(a.rect[0], b.rect[0]),
      Math.min(a.rect[1], b.rect[1]),
      Math.max(a.rect[2], b.rect[2]),
      Math.max(a.rect[3], b.rect[3]),
    ];
    createField(doc, form, doc.getPage(0), `rea_${semA}`, merged, value, { size: 10 });
  }
}

// ---------------------------------------------------------------------------
// Schedule A chunking
// ---------------------------------------------------------------------------

// Wrap at a width safely inside the field: pdf-lib's own appearance
// wrapping overflows the right edge (verified on the first live build),
// so lines are broken here and handed to the field pre-wrapped.
const SCHED_WRAP_WIDTH = 472;

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const wd of text.split(/\s+/)) {
    const t = cur ? cur + " " + wd : wd;
    if (font.widthOfTextAtSize(t, size) > width && cur) {
      lines.push(cur);
      cur = wd;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [""];
}

function chunkParagraphs(paragraphs: string[], font: PDFFont): string[] {
  const chunks: string[] = [];
  let curParas: string[] = [];
  let used = 0;
  for (const para of paragraphs) {
    const lines = wrapText(para, font, SCHED_FONT_SIZE, SCHED_WRAP_WIDTH);
    const cost = lines.length + (curParas.length > 0 ? 1 : 0); // blank line between clauses
    if (used + cost > SCHED_LINES_PER_PAGE && curParas.length > 0) {
      chunks.push(curParas.join("\n\n"));
      curParas = [lines.join("\n")];
      used = lines.length;
    } else {
      curParas.push(lines.join("\n"));
      used += cost;
    }
  }
  if (curParas.length > 0) chunks.push(curParas.join("\n\n"));
  return chunks.length > 0 ? chunks : [""];
}

function schedHeaderFields(
  doc: PDFDocument,
  form: PDFForm,
  page: PDFPage,
  deal: any,
  tag: string
): void {
  const prop = deal.property;
  const ad = deal.agreement_date;
  createField(doc, form, page, `rea_${tag}_buyers`, SCHED_HEADER.buyers, (deal.buyers as string[]).join(" and "), { size: 10 });
  createField(doc, form, page, `rea_${tag}_sellers`, SCHED_HEADER.sellers, (deal.sellers as string[]).join(" and "), { size: 10 });
  createField(doc, form, page, `rea_${tag}_property`, SCHED_HEADER.property, `${prop.address}, ${prop.city}, Ontario`, { size: 9 });
  createField(doc, form, page, `rea_${tag}_day`, SCHED_HEADER.day, ad.day, { size: 10 });
  createField(doc, form, page, `rea_${tag}_month`, SCHED_HEADER.month, ad.month, { size: 10 });
  createField(doc, form, page, `rea_${tag}_year`, SCHED_HEADER.year, ad.year, { size: 10 });
}

function fixFooter(
  page: PDFPage,
  font: PDFFont,
  pageNum: number,
  total: number,
  isContinuation: boolean
): void {
  const white = rgb(1, 1, 1);
  const cover = (rectTop: number[]) => {
    const r = rectTL(rectTop);
    page.drawRectangle({ ...r, color: white });
  };
  cover(FOOTER_TOTAL_RECT);
  page.drawText(String(total), {
    x: FOOTER_TEXT_X.total,
    y: FOOTER_TEXT_Y,
    size: 8,
    font,
  });
  if (isContinuation) {
    cover(FOOTER_PAGENUM_RECT);
    page.drawText(String(pageNum), {
      x: FOOTER_TEXT_X.pagenum,
      y: FOOTER_TEXT_Y,
      size: 8,
      font,
    });
  }
}

// ---------------------------------------------------------------------------
// Form 100
// ---------------------------------------------------------------------------

export async function buildForm100(
  deal: any,
  paragraphs: string[],
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  createdCount = 0;
  const doc = await PDFDocument.load(templateBytes);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const prop = deal.property;
  const join = (arr: string[]) => (arr || []).join(" and ");

  // Page 1 — agreement date via the template's own top widgets
  for (const [part, raw] of Object.entries(TOP_DATE_WIDGETS)) {
    setExistingField(form, raw, deal.agreement_date[part]);
  }
  mappedField(doc, form, "hidband", join(deal.buyers));
  mappedField(doc, form, "hidsand", join(deal.sellers));

  createField(doc, form, doc.getPage(0), "rea_address", [75, 211, 571, 225], prop.address, { size: 10 });
  if (prop.frontage_side) mappedField(doc, form, "txtp_Subdivision", prop.frontage_side);
  if (prop.frontage_street) mappedField(doc, form, "txtsideOf", prop.frontage_street);
  mappedField(doc, form, "txtInThe", prop.municipality || prop.city);
  if (prop.frontage) mappedPair(doc, form, "txtp_SchoolDistrict", "hidSize1", prop.frontage);
  if (prop.depth) mappedPair(doc, form, "txtp_ZoningClass", "hidSize2", prop.depth);
  mappedField(doc, form, "txtp_legaldesc", prop.legal_description, 9);
  // Price/deposit are skippable so partial generation ("what we have so
  // far") never crashes on a missing amount — the fields stay blank on
  // the PDF for the agent to complete by hand.
  if (deal.price) {
    mappedField(doc, form, "txtp_price", fmtMoney(deal.price));
    mappedField(doc, form, "txtp_pricewords", numToWords(deal.price), 9);
  }
  mappedField(
    doc, form, "hidhereupon",
    deal.deposit_due === "upon_acceptance" ? "Upon Acceptance" : String(deal.deposit_due)
  );
  if (deal.deposit) {
    mappedField(doc, form, "txtp_depositwords", numToWords(deal.deposit), 9);
    mappedField(doc, form, "txtp_deposit", fmtMoney(deal.deposit));
  }
  mappedField(doc, form, "txtDepositHolder", deal.deposit_holder);
  mappedField(doc, form, "txtAttachedSchedule", deal.schedule || "A");

  const irr = deal.irrevocable;
  mappedField(doc, form, "hidirrev_v_p", irr.by);
  mappedField(doc, form, "txtp_irrev_t", irr.time);
  mappedField(doc, form, "txtp_OfferExpireDate_d", irr.date.day);
  mappedField(doc, form, "txtp_OfferExpireDate_mmmm", irr.date.month);
  mappedField(doc, form, "txtp_OfferExpireDate_yy", irr.date.year);
  const cd = deal.completion_date;
  mappedField(doc, form, "txtp_closedate_d", cd.day);
  mappedField(doc, form, "txtp_closedate_mmmm", cd.month);
  mappedField(doc, form, "txtp_closedate_yy", cd.year);

  for (const [key, prefix] of [
    ["listing_brokerage", "txtl_"],
    ["selling_brokerage", "txts_"],
  ] as [string, string][]) {
    const brk = deal[key] || {};
    if (brk.brokerage) mappedField(doc, form, prefix + "broker", brk.brokerage);
    if (brk.agent) mappedField(doc, form, prefix + "brkagent", brk.agent);
    if (brk.phone) mappedField(doc, form, prefix + "brkphone", brk.phone);
  }
  for (const [key, prefix] of [
    ["seller_lawyer", "txts_lawyer"],
    ["buyer_lawyer", "txtb_lawyer"],
  ] as [string, string][]) {
    const law = deal[key] || {};
    for (const f of ["name", "address", "email", "phone", "fax"]) {
      const suffix = f === "address" ? "addr" : f;
      if (law[f]) mappedField(doc, form, prefix + suffix, law[f], 9);
    }
  }

  // Page 2 — inclusions / exclusions / rentals / HST
  const chattels: string[] = deal.chattels || [];
  const exclusions: string[] = deal.exclusions || [];
  mappedField(doc, form, "txtp_propincludes", chattels.length ? chattels.join(", ") : "None", 9);
  mappedField(doc, form, "txtp_propexcludes", exclusions.length ? exclusions.join(", ") : "None", 9);
  const rentals: any[] = deal.rental_items || [];
  mappedField(
    doc, form, "txtp_LeasedItems",
    rentals.length
      ? rentals.map((r) => `${r.desc} - rental at $${Number(r.monthly).toFixed(2)}/month`).join("; ")
      : "None",
    9
  );
  createField(doc, form, doc.getPage(1), "rea_hst", HST_RECT, HST_TEXT[deal.hst], { size: 10 });

  // Page 3 — requisition (title search) date on the dotted line
  const tsd = deal.title_search_date;
  for (const part of ["day", "month", "year"] as const) {
    const [x, y] = REQ_DATE_POS[part];
    createField(doc, form, doc.getPage(2), `rea_req_${part}`, [x, y - 12, x + 46, y + 2], tsd[part], { size: 9.5 });
  }

  // Schedule A — page 6 + continuation pages replicating page 6
  const chunks = chunkParagraphs(paragraphs, helvetica);
  const page6 = doc.getPage(5);
  schedHeaderFields(doc, form, page6, deal, "s6");
  createField(doc, form, page6, "rea_sched_body", [SCHED_X0, SCHED_Y_TOP, SCHED_X1, SCHED_Y_END], chunks[0], {
    size: SCHED_FONT_SIZE,
    multiline: true,
  });
  for (let i = 1; i < chunks.length; i++) {
    const src = await PDFDocument.load(templateBytes);
    const [copied] = await doc.copyPages(src, [5]);
    const np = doc.addPage(copied);
    try {
      (np.node as any).delete(PDFName.of("Annots"));
    } catch {
      // no annotations to strip
    }
    schedHeaderFields(doc, form, np, deal, `sc${i}`);
    createField(doc, form, np, `rea_sched_body_${i}`, [SCHED_X0, SCHED_Y_TOP, SCHED_X1, SCHED_Y_END], chunks[i], {
      size: SCHED_FONT_SIZE,
      multiline: true,
    });
  }

  const total = doc.getPageCount();
  if (total !== 6) {
    for (let i = 0; i < total; i++) {
      fixFooter(doc.getPage(i), helvetica, i + 1, total, i >= 6);
    }
  }

  form.updateFieldAppearances(helvetica);
  const bytes = await doc.save();
  return { bytes, pages: total };
}

// ---------------------------------------------------------------------------
// Form 801 (Offer Summary) — the blank is flat, so every value goes into a
// real field created at the mapped rect; the output stays editable.
// ---------------------------------------------------------------------------

function stripMeridiem(t: string): string {
  return t.replace(/\s*[ap]\.?m\.?\s*$/i, "").trim();
}

export async function buildForm801(
  deal: any,
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  createdCount = 0;
  const fields = (mapping801 as any).form801_offer_summary.fields as Record<
    string,
    { rect: number[]; page: number }
  >;
  const doc = await PDFDocument.load(templateBytes);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const page = doc.getPage(0);
  const prop = deal.property;
  const ad = deal.agreement_date;
  const irr = deal.irrevocable;
  const sub = deal.submitted;

  const D = (sem: string, text: string) => {
    const info = fields[sem];
    if (!info) return;
    createField(doc, form, page, `f801_${sem}`, info.rect, text, { size: 10 });
  };

  D("real_property_address", `${prop.address}, ${prop.city}, Ontario`);
  D("agreement_date_day", ad.day);
  D("agreement_date_month", ad.month);
  D("agreement_date_year", ad.year);
  D("submitting_brokerage", deal.selling_brokerage.brokerage);
  D("submitting_sales_rep", deal.selling_brokerage.agent);
  D("buyer_names", (deal.buyers as string[]).join(", "));
  D("submitted_via", sub.via);
  D("submitted_time", stripMeridiem(sub.time));
  D("submitted_day", sub.date.day);
  D("submitted_month", sub.date.month);
  D("submitted_year", sub.date.year);
  D("irrevocable_time", stripMeridiem(irr.time));
  D("irrevocable_day", irr.date.day);
  D("irrevocable_month", irr.date.month);
  D("irrevocable_year", irr.date.year);

  const counter = deal.counter;
  if (counter) {
    const csub = counter.submitted;
    const cirr = counter.irrevocable;
    D("counter_buyer_names", (counter.buyers as string[]).join(", "));
    D("counter_submitted_via", csub.via);
    D("counter_submitted_time", stripMeridiem(csub.time));
    D("counter_submitted_day", csub.date.day);
    D("counter_submitted_month", csub.date.month);
    D("counter_submitted_year", csub.date.year);
    D("counter_irrevocable_time", stripMeridiem(cirr.time));
    D("counter_irrevocable_day", cirr.date.day);
    D("counter_irrevocable_month", cirr.date.month);
    D("counter_irrevocable_year", cirr.date.year);
  }

  D("seller_names", (deal.sellers as string[]).join(", "));
  D("listing_brokerage", deal.listing_brokerage.brokerage);
  D("listing_sales_rep", deal.listing_brokerage.agent);

  form.updateFieldAppearances(helvetica);
  const bytes = await doc.save();
  return { bytes, pages: 1 };
}

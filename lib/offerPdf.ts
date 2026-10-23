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

import { PDFDocument, PDFName, PDFString, StandardFonts, decodePDFRawStream, rgb } from "pdf-lib";
import type { PDFFont, PDFForm, PDFPage } from "pdf-lib";
import mapping100 from "./fieldMapping100.json";
import mapping101 from "./fieldMapping101.json";
import mapping102 from "./fieldMapping102.json";
import mapping801 from "./fieldMapping801.json";
import mapping320 from "./fieldMapping320.json";

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
// Header values sink ~1.9pt below their printed lines (measured
// 2026-10-21) — created a touch higher to land on the line.
const SCHED_HEADER_DY = 1.9;
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
  day: [258, 201, 290, 215],
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
  opts: { size?: number; multiline?: boolean; dy?: number } = {}
): void {
  const unique = `${name}_${createdCount++}`;
  const field = form.createTextField(unique);
  if (opts.multiline) field.enableMultiline();
  // dy raises the field on the page (top-origin rects: subtract to raise).
  const shifted = opts.dy
    ? [rectTop[0], rectTop[1] - opts.dy, rectTop[2], rectTop[3] - opts.dy]
    : rectTop;
  const r = rectTL(shifted);
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
  size = 10,
  mapping: any = mapping100
): void {
  const m = (mapping as any)[sem];
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
  value: string,
  mapping: any = mapping100
): void {
  const a = (mapping as any)[semA];
  const b = (mapping as any)[semB];
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
// Vertical calibration (measured 2026-10-21 against the printed lines)
//
// pdf-lib anchors each value to its field rect, and the templates' rects
// don't all sit on their printed lines: Form 801 values land ~2.3pt too
// LOW, Form 320 values ~2.5pt too HIGH, and a few Form 100 rows float.
// Each mapping carries a "calibration" block: a form-wide default_dy
// (points; positive raises the text on the page) plus per-field
// overrides keyed by semantic name (or the exact output field name).
// Shifting the widget rect shifts the rendered value 1:1 (verified), and
// the click target moves with it — imperceptible at these sizes.
// ---------------------------------------------------------------------------

function applyCalibration(
  form: PDFForm,
  cal: any,
  semToRaw?: Record<string, string>
): void {
  if (!cal) return;
  const def = Number(cal.default_dy || 0);
  const per: Record<string, any> = cal.fields || {};
  for (const field of form.getFields()) {
    const name = field.getName();
    let tf: any;
    try {
      tf = form.getTextField(name);
    } catch {
      continue; // not a text field
    }
    let spec = per[name];
    if (!spec) {
      // Created fields carry a uniqueness suffix (f801_<sem>_3, rea_hst_0…)
      const noCount = name.replace(/_\d+$/, "");
      if (noCount !== name) spec = per[noCount];
      if (!spec) {
        const stripped = noCount.replace(/^(f801_|f320_|f324_|rea_)/, "");
        if (stripped !== noCount) spec = per[stripped];
      }
    }
    if (!spec && semToRaw) {
      for (const [sem, raw] of Object.entries(semToRaw)) {
        if (raw === name && per[sem]) {
          spec = per[sem];
          break;
        }
      }
    }
    const dy = spec?.dy != null ? Number(spec.dy) : def;
    const dx = Number(spec?.dx || 0);
    const dw = Number(spec?.dw || 0);
    if (!dy && !dx && !dw) continue;
    try {
      for (const w of tf.acroField.getWidgets()) {
        const r = w.getRectangle();
        w.setRectangle({
          x: r.x + dx,
          y: r.y + dy,
          width: r.width + dw,
          height: r.height,
        });
      }
    } catch {
      // a field that resists shifting simply keeps its old placement
    }
  }
}

// The 320/324 blanks' tick for some boxes is a ZapfDingbats glyph
// appearance that common renderers draw as nothing — the box LOOKS
// unticked even with /AS and /V set (verified 2026-10-21 on
// chkOpt_CoOp / chkOpt_CBrokComm / chkOpt_CoOp2, while the vector-drawn
// chkOpt_CBrokComm2 tick renders fine). Replace the on-state appearance
// of every box we tick with a self-drawn vector check: same look as the
// boxes that work, no font dependency, flattens cleanly.
function replaceTickAppearance(doc: PDFDocument, widget: any, onState: string): void {
  try {
    const r = widget.getRectangle();
    const W = r.width;
    const H = r.height;
    const x1 = W * 0.2, y1 = H * 0.44;
    const x2 = W * 0.42, y2 = H * 0.2;
    const x3 = W * 0.84, y3 = H * 0.8;
    const content =
      `q 0 0 0 RG 1.9 w 1 J 1 j ` +
      `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l ` +
      `${x3.toFixed(2)} ${y3.toFixed(2)} l S Q`;
    const stream = (doc.context as any).flateStream(content, {
      Type: PDFName.of("XObject"),
      Subtype: PDFName.of("Form"),
      BBox: (doc.context as any).obj([0, 0, W, H]),
      Resources: (doc.context as any).obj({}),
    });
    const ref = doc.context.register(stream);
    let ap = widget.dict.lookup(PDFName.of("AP"));
    if (!ap || typeof ap.set !== "function") {
      ap = (doc.context as any).obj({});
      widget.dict.set(PDFName.of("AP"), ap);
    }
    let n = ap.lookup(PDFName.of("N"));
    if (!n || typeof n.set !== "function") {
      n = (doc.context as any).obj({});
      ap.set(PDFName.of("N"), n);
    }
    n.set(PDFName.of(onState), ref);
  } catch {
    // the /AS + /V tick still stands; only the drawn check is skipped
  }
}

// pdf-lib paints an OPAQUE WHITE background over the whole rect of
// every text field it creates — swallowing whatever print lies inside
// the rect (the caption under the 801's address line, the words
// ", have signed" inside the buyer-name field's span, the dotted
// leaders themselves). Real form fills are transparent: the print
// shows through and the value sits on the dots. Strip the background
// block from created fields' appearance streams after generation
// (template-owned fields don't have this block and are left alone).
// NOTE: the strip must run on a RELOADED document — on the live doc
// the appearances are PDFContentStreams, whose contents can't be
// decoded as raw bytes (learned the hard way: the first version
// silently no-opped in production while working on saved files).
const BG_BLOCK_RE =
  /q\s+q\s+[\d.]+ [\d.]+ [\d.]+ rg\s+[\d.]+ [\d.]+ [\d.]+ RG\s+[\d.]+ w\s+\[\] 0 d\s+(?:1 0 0 1 0 0 cm\s+)+0 0 m\s+0 [\d.]+ l\s+[\d.]+ [\d.]+ l\s+[\d.]+ 0 l\s+h\s+f\s+Q\s+/;

async function stripCreatedFieldBackgrounds(doc: PDFDocument): Promise<PDFDocument> {
  const saved = await doc.save();
  const reloaded = await PDFDocument.load(saved, { ignoreEncryption: true });
  const form = reloaded.getForm();
  for (const field of form.getFields()) {
    const name = field.getName();
    if (!/^(f801_|f320_|f324_|rea_)/.test(name)) continue;
    let tf: any;
    try {
      tf = form.getTextField(name);
    } catch {
      continue;
    }
    for (const w of tf.acroField.getWidgets()) {
      try {
        let ap: any = w.dict.lookup(PDFName.of("AP"));
        if (ap && typeof ap.lookup !== "function") ap = reloaded.context.lookup(ap);
        if (!ap || typeof ap.lookup !== "function") continue;
        const nRef = ap.lookup(PDFName.of("N"));
        if (!nRef) continue;
        const stream: any = reloaded.context.lookup(nRef);
        if (!stream?.dict) continue;
        const text = new TextDecoder("latin1").decode(
          decodePDFRawStream(stream).decode()
        );
        if (!BG_BLOCK_RE.test(text)) continue;
        const stripped = text.replace(BG_BLOCK_RE, "q ");
        const fresh = (reloaded.context as any).flateStream(stripped, {
          Type: PDFName.of("XObject"),
          Subtype: PDFName.of("Form"),
          BBox: stream.dict.lookup(PDFName.of("BBox")),
          Resources: stream.dict.lookup(PDFName.of("Resources")),
        });
        ap.set(PDFName.of("N"), reloaded.context.register(fresh));
      } catch {
        // leave the appearance exactly as generated
      }
    }
  }
  return reloaded;
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
  createField(doc, form, page, `rea_${tag}_buyers`, SCHED_HEADER.buyers, (deal.buyers as string[]).join(" and "), { size: 10, dy: SCHED_HEADER_DY });
  createField(doc, form, page, `rea_${tag}_sellers`, SCHED_HEADER.sellers, (deal.sellers as string[]).join(" and "), { size: 10, dy: SCHED_HEADER_DY });
  createField(doc, form, page, `rea_${tag}_property`, SCHED_HEADER.property, `${prop.address}, ${prop.city}, Ontario`, { size: 9, dy: SCHED_HEADER_DY });
  createField(doc, form, page, `rea_${tag}_day`, SCHED_HEADER.day, ad.day, { size: 10, dy: SCHED_HEADER_DY });
  createField(doc, form, page, `rea_${tag}_month`, SCHED_HEADER.month, ad.month, { size: 10, dy: SCHED_HEADER_DY });
  createField(doc, form, page, `rea_${tag}_year`, SCHED_HEADER.year, ad.year, { size: 10, dy: SCHED_HEADER_DY });
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

// One core fills all three APS forms (100 freehold / 101 condominium /
// 102 co-operative): same parties, price, deposit, dates, brokerages,
// lawyers and Schedule A machinery; the cfg carries each form's field
// mapping plus how its HST line, requisition date and address are
// filled, and an extras hook for the form-specific blocks.
type ApsCfg = {
  mapping: any;
  topDate: Record<string, string>;
  addressField?: string; // semantic for a template address widget (101/102)
  hstField?: string; // template widget for the HST choice (101/102)
  reqFields?: { day: string; month: string; year: string }; // template widgets (101/102)
  multiLine?: boolean; // chattels/fixtures/rentals live on separate ruled lines (101/102)
  extras?: (doc: PDFDocument, form: PDFForm, deal: any, helvetica: PDFFont) => void;
};

async function buildApsCore(
  deal: any,
  paragraphs: string[],
  templateBytes: Uint8Array,
  cfg: ApsCfg
): Promise<{ bytes: Uint8Array; pages: number }> {
  createdCount = 0;
  const doc = await PDFDocument.load(templateBytes);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const prop = deal.property;
  const join = (arr: string[]) => (arr || []).join(" and ");

  const MF = (sem: string, v: string, sz?: number) =>
    mappedField(doc, form, sem, v, sz, cfg.mapping);
  const MP = (semA: string, semB: string, v: string) =>
    mappedPair(doc, form, semA, semB, v, cfg.mapping);

  // Page 1 — agreement date via the template's own top widgets
  for (const [part, raw] of Object.entries(cfg.topDate)) {
    setExistingField(form, raw, deal.agreement_date[part]);
  }
  MF("hidband", join(deal.buyers));
  MF("hidsand", join(deal.sellers));

  if (cfg.addressField) {
    MF(cfg.addressField, prop.address);
  } else {
    createField(doc, form, doc.getPage(0), "rea_address", [75, 211, 571, 225], prop.address, { size: 10 });
  }
  if (prop.frontage_side) MF("txtp_Subdivision", prop.frontage_side);
  if (prop.frontage_street) MF("txtsideOf", prop.frontage_street);
  if (prop.municipality_type) MF("hidInThe1", prop.municipality_type);
  MF("txtInThe", prop.municipality || prop.city);
  if (prop.frontage) MP("txtp_SchoolDistrict", "hidSize1", prop.frontage);
  if (prop.depth) MP("txtp_ZoningClass", "hidSize2", prop.depth);
  MF("txtp_legaldesc", prop.legal_description, 9);
  // Price/deposit are skippable so partial generation ("what we have so
  // far") never crashes on a missing amount — the fields stay blank on
  // the PDF for the agent to complete by hand.
  if (deal.price) {
    MF("txtp_price", fmtMoney(deal.price));
    MF("txtp_pricewords", numToWords(deal.price), 9);
  }
  mappedField(
    doc, form, "hidhereupon",
    deal.deposit_due === "upon_acceptance" ? "Upon Acceptance" : String(deal.deposit_due)
  );
  if (deal.deposit) {
    MF("txtp_depositwords", numToWords(deal.deposit), 9);
    MF("txtp_deposit", fmtMoney(deal.deposit));
  }
  MF("txtDepositHolder", deal.deposit_holder);
  // Schedules line: only what's typed — Schedule A is part of the form
  // itself, so there's no "A" default (Tim, 2026-10-21).
  if (deal.schedule) MF("txtAttachedSchedule", deal.schedule);

  const irr = deal.irrevocable;
  MF("hidirrev_v_p", irr.by);
  MF("txtp_irrev_t", irr.time);
  MF("txtp_OfferExpireDate_d", irr.date.day);
  MF("txtp_OfferExpireDate_mmmm", irr.date.month);
  MF("txtp_OfferExpireDate_yy", irr.date.year);
  const cd = deal.completion_date;
  MF("txtp_closedate_d", cd.day);
  MF("txtp_closedate_mmmm", cd.month);
  MF("txtp_closedate_yy", cd.year);

  for (const [key, prefix] of [
    ["listing_brokerage", "txtl_"],
    ["selling_brokerage", "txts_"],
  ] as [string, string][]) {
    const brk = deal[key] || {};
    if (brk.brokerage) MF(prefix + "broker", brk.brokerage);
    if (brk.agent) MF(prefix + "brkagent", brk.agent);
    if (brk.phone) MF(prefix + "brkphone", brk.phone);
    if (brk.email) MF(prefix + "brkagentemail", brk.email);
  }
  for (const [key, prefix] of [
    ["seller_lawyer", "txts_lawyer"],
    ["buyer_lawyer", "txtb_lawyer"],
  ] as [string, string][]) {
    const law = deal[key] || {};
    for (const f of ["name", "address", "email", "phone", "fax"]) {
      const suffix = f === "address" ? "addr" : f;
      if (law[f]) MF(prefix + suffix, law[f], 9);
    }
  }

  // Page 2 — inclusions / exclusions / rentals / HST
  // (101/102 print these on separate ruled lines — their extras hook
  // fills them line by line and the core skips the single-field fill.)
  if (!cfg.multiLine) {
    const chattels: string[] = deal.chattels || [];
    const exclusions: string[] = deal.exclusions || [];
    MF("txtp_propincludes", chattels.length ? chattels.join(", ") : "None", 9);
    MF("txtp_propexcludes", exclusions.length ? exclusions.join(", ") : "None", 9);
    const rentals: any[] = deal.rental_items || [];
    MF(
      "txtp_LeasedItems",
      rentals.length
        ? rentals
            .map((r) =>
              r.monthly !== "" && r.monthly != null && Number(r.monthly) > 0
                ? `${r.desc} - rental at $${Number(r.monthly).toFixed(2)}/month`
                : `${r.desc}`
            )
            .join("; ")
        : "None",
      9
    );
  }
  if (cfg.hstField) {
    if (setExistingField(form, cfg.hstField, HST_TEXT[deal.hst])) {
      setFieldFontSize(form, cfg.hstField, 10);
    }
  } else {
    createField(doc, form, doc.getPage(1), "rea_hst", HST_RECT, HST_TEXT[deal.hst], { size: 10 });
  }

  // Page 3 — requisition (title search) date on the dotted line
  const tsd = deal.title_search_date;
  if (cfg.reqFields) {
    for (const part of ["day", "month", "year"] as const) {
      const raw = cfg.reqFields[part];
      if (setExistingField(form, raw, tsd[part])) setFieldFontSize(form, raw, 10);
    }
  } else {
    for (const part of ["day", "month", "year"] as const) {
      const [x, y] = REQ_DATE_POS[part];
      createField(doc, form, doc.getPage(2), `rea_req_${part}`, [x, y - 12, x + 46, y + 2], tsd[part], { size: 9.5 });
    }
  }

  // Form-specific blocks (condo / co-op details, ruled-line paragraphs)
  if (cfg.extras) cfg.extras(doc, form, deal, helvetica);

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

  const semToRaw100: Record<string, string> = {};
  for (const [sem, m] of Object.entries(cfg.mapping as any)) {
    if (m && typeof m === "object" && (m as any).blank) {
      semToRaw100[sem] = (m as any).blank;
    }
  }
  applyCalibration(form, (cfg.mapping as any).calibration, semToRaw100);
  form.updateFieldAppearances(helvetica);
  const finalDoc = await stripCreatedFieldBackgrounds(doc);
  const bytes = await finalDoc.save();
  return { bytes, pages: total };
}

export async function buildForm100(
  deal: any,
  paragraphs: string[],
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildApsCore(deal, paragraphs, templateBytes, {
    mapping: mapping100,
    topDate: TOP_DATE_WIDGETS,
  });
}

// Wrap a long value across a form's ruled line fields (Forms 101/102
// print chattels / fixtures / rentals / expense details on separate
// one-line fields instead of one big box).
function fillApsLines(
  form: PDFForm,
  helvetica: PDFFont,
  lines: { name: string; w: number }[],
  text: string
): void {
  if (!lines || lines.length === 0) return;
  // Greedy per-line fill: each ruled line takes as many whole words as
  // fit its own width (the first line of a block is often short — it
  // starts mid-sentence after the printed lead-in). Any remainder
  // lands on the last line so nothing is silently dropped.
  const words = String(text).split(/\s+/).filter(Boolean);
  let wi = 0;
  lines.forEach((ln, i) => {
    let cur = "";
    while (wi < words.length) {
      const t = cur ? cur + " " + words[wi] : words[wi];
      if (helvetica.widthOfTextAtSize(t, 9.5) > ln.w && cur) break;
      cur = t;
      wi++;
    }
    if (i === lines.length - 1 && wi < words.length) {
      cur = (cur ? cur + " " : "") + words.slice(wi).join(" ");
    }
    if (cur && setExistingField(form, ln.name, cur)) {
      setFieldFontSize(form, ln.name, 9.5);
    }
  });
}

function apsLineTexts(deal: any): { includes: string; excludes: string; rentals: string } {
  const chattels: string[] = deal.chattels || [];
  const exclusions: string[] = deal.exclusions || [];
  const rentals: any[] = deal.rental_items || [];
  return {
    includes: chattels.length ? chattels.join(", ") : "None",
    excludes: exclusions.length ? exclusions.join(", ") : "None",
    rentals: rentals.length
      ? rentals
          .map((r) =>
            r.monthly !== "" && r.monthly != null && Number(r.monthly) > 0
              ? `${r.desc} - rental at $${Number(r.monthly).toFixed(2)}/month`
              : `${r.desc}`
          )
          .join("; ")
      : "None",
  };
}

function semSetter(form: PDFForm, mapping: any) {
  return (sem: string, v: any) => {
    if (v === null || v === undefined || String(v).trim() === "") return;
    const m = (mapping as any)[sem];
    if (m?.blank && setExistingField(form, m.blank, String(v))) {
      setFieldFontSize(form, m.blank, 10);
    }
  };
}

// Form 101 extras — the condominium block on page 1, the common
// expenses + parking/locker paragraphs on page 2, the Property
// Manager line on page 5, and the ruled-line paragraphs.
function fill101Extras(doc: PDFDocument, form: PDFForm, deal: any, helvetica: PDFFont): void {
  void doc;
  const M: any = mapping101;
  const set = semSetter(form, M);
  const c = deal.condo || {};
  set("condo_unit_type", c.unit_type);
  set("condo_unit_no", c.unit_no ?? c.unit_number);
  set("condo_corp", c.corporation_name);
  set("condo_plan", c.plan_no);
  set("condo_unit_number", c.unit_number ?? c.unit_no);
  set("condo_level", c.level_no);
  set("condo_building", c.building_no);
  set("condo_parking_no", c.parking_no);
  set("condo_parking_level", c.parking_level);
  set("condo_locker_no", c.locker_no);
  set("condo_locker_level", c.locker_level);
  if (c.common_expenses) set("condo_exp_amount", fmtMoney(c.common_expenses));
  if (c.common_includes) fillApsLines(form, helvetica, M._lines.exp_includes, String(c.common_includes));
  if (c.parking_assigned) fillApsLines(form, helvetica, M._lines.parking_assigned, String(c.parking_assigned));
  set("condo_parking_cost", c.parking_cost);
  set("pm_name", c.property_manager_name);
  set("pm_address", c.property_manager_address);
  set("pm_phone", c.property_manager_phone);
  set("pm_fax", c.property_manager_fax);
  const t = apsLineTexts(deal);
  fillApsLines(form, helvetica, M._lines.includes, t.includes);
  fillApsLines(form, helvetica, M._lines.excludes, t.excludes);
  fillApsLines(form, helvetica, M._lines.rentals, t.rentals);
}

export async function buildForm101(
  deal: any,
  paragraphs: string[],
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildApsCore(deal, paragraphs, templateBytes, {
    mapping: mapping101,
    topDate: (mapping101 as any)._top_date,
    addressField: "txtp_address",
    hstField: (mapping101 as any)._hst_field,
    reqFields: (mapping101 as any)._req_fields,
    multiLine: true,
    extras: fill101Extras,
  });
}

// Form 102 extras — the co-operative block on page 1 (unit, parking,
// locker, shares, corporation), maintenance expenses + parking on
// pages 2-3, the board-approval deadline in ¶10, the Property
// Manager line, and the ruled-line paragraphs.
function fill102Extras(doc: PDFDocument, form: PDFForm, deal: any, helvetica: PDFFont): void {
  void doc;
  const M: any = mapping102;
  const set = semSetter(form, M);
  const c = deal.cooperative || {};
  set("coop_unit", c.unit);
  set("coop_parking_no", c.parking_no);
  set("coop_parking_level", c.parking_level);
  set("coop_locker_no", c.locker_no);
  set("coop_locker_level", c.locker_level);
  set("coop_shares", c.shares);
  set("coop_corp", c.corporation_name);
  if (c.maintenance_expenses) set("coop_exp_amount", fmtMoney(c.maintenance_expenses));
  if (c.maintenance_includes) fillApsLines(form, helvetica, M._lines.exp_includes, String(c.maintenance_includes));
  if (c.parking_assigned) fillApsLines(form, helvetica, M._lines.parking_assigned, String(c.parking_assigned));
  set("coop_parking_cost", c.parking_cost);
  const ap = c.approval_date || {};
  set("coop_approval_day", ap.day);
  set("coop_approval_month", ap.month);
  set("coop_approval_year", ap.year);
  set("pm_line", c.property_manager);
  const t = apsLineTexts(deal);
  fillApsLines(form, helvetica, M._lines.includes, t.includes);
  fillApsLines(form, helvetica, M._lines.excludes, t.excludes);
  fillApsLines(form, helvetica, M._lines.rentals, t.rentals);
}

export async function buildForm102(
  deal: any,
  paragraphs: string[],
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildApsCore(deal, paragraphs, templateBytes, {
    mapping: mapping102,
    topDate: (mapping102 as any)._top_date,
    addressField: "txtp_address",
    hstField: (mapping102 as any)._hst_field,
    reqFields: (mapping102 as any)._req_fields,
    multiLine: true,
    extras: fill102Extras,
  });
}

// APS validation for the condo / co-op variants: the shared core,
// except the freehold legal description (the condo corporation /
// plan / unit block and the co-op corporation / shares block take
// its place), plus the form-specific requireds.
export function validateAps(deal: any, kind: "101" | "102"): string[] {
  const missing = validateDeal(deal).filter(
    (m) => m !== "property.legal_description"
  );
  if (kind === "101") {
    req(deal, "condo.corporation_name", missing);
    req(deal, "condo.plan_no", missing);
    req(deal, "condo.unit_no", missing);
  } else {
    req(deal, "cooperative.corporation_name", missing);
    req(deal, "cooperative.shares", missing);
    req(deal, "cooperative.unit", missing);
  }
  return missing;
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

  applyCalibration(form, (mapping801 as any).form801_offer_summary?.calibration);
  form.updateFieldAppearances(helvetica);
  const finalDoc = await stripCreatedFieldBackgrounds(doc);
  const bytes = await finalDoc.save();
  return { bytes, pages: 1 };
}

// ---------------------------------------------------------------------------
// Forms 320 / 324 — Confirmation of Co-operation and Representation.
// Identical field geometry (verified against both blanks, 2026-10-21),
// so one core fills both; the deal shape is the same (for the 324 the
// "buyers" are the tenants and the "sellers" are the landlords).
// ---------------------------------------------------------------------------

export function validate320(deal: any): string[] {
  const missing: string[] = [];
  req(deal, "buyers", missing);
  req(deal, "sellers", missing);
  req(deal, "property.address", missing);
  req(deal, "selling_brokerage.brokerage", missing);
  req(deal, "listing_brokerage.brokerage", missing);
  const coop = deal.coop || {};
  const rep = String(coop.representation || "coop");
  if (rep === "coop" && String(coop.pay_basis || "mls") === "mls" && !String(coop.share || "").trim()) {
    missing.push("coop.share (payable to the co-operating brokerage)");
  }
  return missing;
}

interface CoopTicks {
  header4a: [string, string];
  item4a1: [string, string];
  header4b: [string, string];
  item4b1: [string, string];
  item4b2: [string, string];
}

async function buildCoopForm(
  deal: any,
  templateBytes: Uint8Array,
  tag: string,
  ticks: CoopTicks
): Promise<{ bytes: Uint8Array; pages: number }> {
  createdCount = 0;
  const fields = (mapping320 as any).form320_confirmation.fields as Record<
    string,
    { rect: number[]; page: number }
  >;
  // The WebForms blanks carry an owner password — pdf-lib needs
  // ignoreEncryption to open them (the saved output is unencrypted).
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const prop = deal.property || {};

  // Created-field fallback (measured rects) — used only when the blank
  // in the store has no named fields of its own.
  const D = (sem: string, text?: string, size = 10) => {
    const info = fields[sem];
    if (!info || !text) return;
    createField(doc, form, doc.getPage(info.page || 0), `${tag}_${sem}`, info.rect, text, {
      size,
    });
  };
  const join = (arr: string[]) => (arr || []).join(" and ");
  const hasField = (name: string): boolean => {
    try {
      form.getField(name);
      return true;
    } catch {
      return false;
    }
  };
  const setText = (name: string, value?: string): boolean => {
    if (!value) return false;
    try {
      form.getTextField(name).setText(value);
      return true;
    } catch {
      return false;
    }
  };
  // Tick ONE widget of a (possibly multi-widget) checkbox by its
  // on-state value — e.g. the 320's commission group whose boxes are
  // '1' and '2', and the 324's, whose boxes are '0' and '1'.
  const tickValue = (name: string, wanted: string): boolean => {
    try {
      const field: any = form.getField(name);
      const widgets = field.acroField.getWidgets();
      let ok = false;
      for (const w of widgets) {
        const n: any = w.dict.lookup(PDFName.of("AP"))?.lookup(PDFName.of("N"));
        const keys: string[] = n
          ? n
              .keys()
              .map((k: any) => String(k.asString ? k.asString() : k).replace(/^\//, ""))
          : [];
        const match = keys.includes(wanted);
        w.dict.set(PDFName.of("AS"), PDFName.of(match ? wanted : "Off"));
        if (match) {
          ok = true;
          replaceTickAppearance(doc, w, wanted);
        }
      }
      if (ok) field.acroField.dict.set(PDFName.of("V"), PDFName.of(wanted));
      return ok;
    } catch {
      return false;
    }
  };
  const tick = (name: string, wanted: string, fallbackSem?: string) => {
    if (tickValue(name, wanted)) return;
    try {
      form.getCheckBox(name).check();
      return;
    } catch {
      /* fall through to the drawn X */
    }
    if (fallbackSem) D(fallbackSem, "X", 8);
  };

  const sb = deal.selling_brokerage || {};
  const coop = deal.coop || {};
  const share = String(coop.share || "").trim();
  const commission = share
    ? `${share.includes("%") ? share : `${share}%`} ${String(
        coop.basis || "of the purchase price"
      ).trim()}, plus HST`
    : "";

  if (hasField("txtbuyer1")) {
    // The blank's own fields — the proper WebForms route.
    const buyers = (deal.buyers as string[]) || [];
    const sellers = (deal.sellers as string[]) || [];
    setText("txtbuyer1", buyers[0]);
    if (buyers.length > 1) {
      setText("hidband", "and");
      setText("txtbuyer2", buyers.slice(1).join(" and "));
    }
    setText("txtseller1", sellers[0]);
    if (sellers.length > 1) {
      setText("hidsand", "and");
      setText("txtseller2", sellers.slice(1).join(" and "));
    }
    const addr = String(prop.address || "");
    const m = addr.match(/^(\d+)\s+(.*)$/);
    if (m) {
      setText("txtp_streetnum", m[1]);
      setText("txtp_street", m[2]);
    } else if (addr) {
      setText("txtp_street", addr);
    }
    setText("txtp_UnitNumber", prop.unit_number || prop.unit);
    setText("txtp_city", prop.city);
    if (prop.city || prop.address) setText("txtp_state", prop.province || "Ontario");
    setText("txtp_zipcode", prop.postal_code);

    // Representation decides which sections get ticked (Tim,
    // 2026-10-21). The usual case is 'coop': we're the co-operating
    // brokerage representing the buyer/tenant, §4 is ticked, and the
    // seller brokerage's own sections (1-3) stay blank for them. The
    // other cases are all in-house (our brokerage is also the listing
    // brokerage), mapped to the form's own boxes:
    //   same_brokerage_diff_reps → §1 header + §1a3 (chkOpt_provide '3')
    //   multiple_brokerage       → §2 header + §2a
    //   multiple_same_rep        → §2 header only (§2b has no box on
    //                              the form — verified against the blank)
    //   sold_by_us_direct        → §3 widget '1' (paid by buyer direct)
    //   sold_by_us_agreement     → §3 widget '2' (commission agreement)
    // (§1/§2/§3 field names are identical on the 320 and the 324.)
    const rep = String(coop.representation || "coop");
    const lb = deal.listing_brokerage || {};
    if (rep === "same_brokerage_diff_reps") {
      tick("chkOpt_ListBrok1", "1");
      tick("chkOpt_provide", "3");
    } else if (rep === "multiple_brokerage") {
      tick("chkOpt_ListBrok2", "1");
      tick("chkOpt_ListBrok2a", "1");
    } else if (rep === "multiple_same_rep") {
      tick("chkOpt_ListBrok2", "1");
    } else if (rep === "sold_by_us_direct") {
      tick("chkOpt_ListBrok3", "1");
    } else if (rep === "sold_by_us_agreement") {
      tick("chkOpt_ListBrok3", "2");
    } else {
      tick(ticks.header4a[0], ticks.header4a[1]);
      tick(ticks.item4a1[0], ticks.item4a1[1], "check_4a1");
      tick(ticks.header4b[0], ticks.header4b[1]);
      if (String(coop.pay_basis || "mls") === "follows") {
        tick(ticks.item4b2[0], ticks.item4b2[1]);
        setText("txtcoopCommisionC1", coop.pay_text);
      } else if (commission) {
        tick(ticks.item4b1[0], ticks.item4b1[1], "check_4b1");
        setText("txtp_bal2ndMortgage", commission);
      }
    }

    // Page 2 — the co-operating/buyer brokerage's block always; the
    // seller brokerage's block too when the listing side is also ours
    // (any non-coop case). For 'coop' it stays blank for them.
    setText("txts_broker", sb.brokerage);
    setText("txts_brkphone", sb.phone);
    setText("txts_brkagent", sb.agent);
    if (rep !== "coop") {
      setText("txtl_broker", lb.brokerage);
      setText("txtl_brkphone", lb.phone);
      setText("txtl_brkagent", lb.agent);
    }
  } else {
    // Fallback for a flat blank: created fields at measured rects.
    D("buyers", join(deal.buyers));
    D("sellers", join(deal.sellers));
    D("property", [prop.address, prop.city].filter(Boolean).join(", "));
    D("check_4a1", "X", 8);
    D("check_4b1", "X", 8);
    if (commission) D("commission_amount", commission);
    D("coop_brokerage", sb.brokerage);
    D("coop_tel", sb.phone);
    D("coop_print_name", sb.agent);
  }

  applyCalibration(form, (mapping320 as any).form320_confirmation?.calibration);
  form.updateFieldAppearances(helvetica);
  const finalDoc = await stripCreatedFieldBackgrounds(doc);
  const bytes = await finalDoc.save();
  return { bytes, pages: 2 };
}

export async function buildForm320(
  deal: any,
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildCoopForm(deal, templateBytes, "f320", {
    header4a: ["chkOpt_CoOp", "1"],
    item4a1: ["chkOpt_CBrokComm", "1"],
    header4b: ["chkOpt_CoOp2", "1"],
    item4b1: ["chkOpt_CBrokComm2", "1"],
    item4b2: ["chkOpt_CBrokComm2", "2"],
  });
}

export async function buildForm324(
  deal: any,
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildCoopForm(deal, templateBytes, "f324", {
    header4a: ["chkOpt_MultiDesign", "1"],
    item4a1: ["chkOpt_MultiRep1a", "1"],
    header4b: ["chkOpt_CoOp2", "1"],
    item4b1: ["chkOpt_MultiRep1", "0"],
    item4b2: ["chkOpt_MultiRep1", "1"],
  });
}

// ---------------------------------------------------------------------------
// Forms 124 / 123 — Notice of Fulfillment of Conditions / Waiver.
// Post-acceptance forms: they live in the same offer package as the
// 100/801/320 and are usually generated (and sent for signature) days
// after the offer itself. Both blanks are one page with the same
// layout — header (buyer / seller / real property / agreement date),
// a ruled body area of 18 single-line fields quoting the condition(s),
// a DATED line, signature blocks (left for ink / iinked spots) and a
// receipt block that stays blank for the receiving side to complete.
// Field names differ per form; the tables below were mapped from the
// blanks' geometry 2026-10-22.
// ---------------------------------------------------------------------------

interface NoticeFields {
  buyer: string;
  seller: string;
  prop1: string;
  prop2: string;
  day: string;
  month: string;
  year: string;
  lines: string[];
  dPlace: string;
  dTime: string;
  dDay: string;
  dMonth: string;
  dYear: string;
  printName: string;
}

const NOTICE_FIELDS: Record<"124" | "123", NoticeFields> = {
  "124": {
    buyer: "form124.0.0",
    seller: "form124.0.1",
    prop1: "form124.1.0",
    prop2: "form124.1.1",
    day: "form124.2.1",
    month: "form124.2.0",
    year: "form124.3.0",
    lines: [
      ...Array.from({ length: 16 }, (_, i) => `form124.3.1.${i}`),
      "form124.3.1.16.0",
      "form124.3.1.16.1",
    ],
    dPlace: "form124.4.0",
    dTime: "form124.4.1",
    dDay: "form124.5.0",
    dMonth: "form124.5.1",
    dYear: "form124.6.0",
    printName: "form124.10.1",
  },
  "123": {
    buyer: "form123.0.0",
    seller: "form123.0.1",
    prop1: "form123.1.0",
    prop2: "form123.1.1",
    day: "form123.2.0",
    month: "form123.2.1",
    year: "form123.3.0",
    lines: [
      ...Array.from({ length: 14 }, (_, i) => `form123.3.1.${i}`),
      "form123.3.1.14.0",
      "form123.3.1.14.1",
      "form123.3.1.14.2",
      "form123.3.1.14.3",
    ],
    dPlace: "form123.9.1",
    dTime: "form123.9.0",
    dDay: "form123.8.1",
    dMonth: "form123.8.0",
    dYear: "form123.7.1",
    printName: "form123.4.0.1.0",
  },
};

// Vertical calibration for the notice forms, measured against the
// printed dotted lines (audit 2026-10-22). Filled in after measurement.
const NOTICE_CALIBRATION: Record<"124" | "123", number> = {
  "124": -3.2,
  "123": -3.2,
};

export function validateNotice(deal: any, key: "fulfillment" | "waiver"): string[] {
  const missing: string[] = [];
  req(deal, "buyers", missing);
  req(deal, "sellers", missing);
  req(deal, "property.address", missing);
  reqDate(deal, "agreement_date", missing);
  const n = deal?.[key] || {};
  const hasConditions = Array.isArray(n.conditions) && n.conditions.length > 0;
  const hasText = typeof n.extra_text === "string" && n.extra_text.trim().length > 0;
  if (!hasConditions && !hasText) {
    missing.push(
      key === "fulfillment"
        ? "fulfillment.conditions (which conditions are fulfilled — or add text)"
        : "waiver.conditions (which conditions are waived — or add text)"
    );
  }
  return missing;
}

function torontoTodayParts(): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return { day: get("day"), month: get("month"), year: get("year").slice(2) };
}

async function buildNoticeForm(
  deal: any,
  paragraphs: string[],
  templateBytes: Uint8Array,
  kind: "124" | "123",
  key: "fulfillment" | "waiver"
): Promise<{ bytes: Uint8Array; pages: number }> {
  createdCount = 0;
  const F = NOTICE_FIELDS[kind];
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const setText = (name: string, value?: string): void => {
    if (!value) return;
    try {
      form.getTextField(name).setText(value);
    } catch {
      // a renamed/absent widget leaves the value out rather than failing
    }
  };
  const join = (arr: string[]) => (arr || []).join(" and ");
  const prop = deal.property || {};
  const ad = deal.agreement_date || {};

  setText(F.buyer, join(deal.buyers));
  setText(F.seller, join(deal.sellers));
  setText(F.prop1, [prop.address, prop.city].filter(Boolean).join(", "));
  setText(F.prop2, prop.legal_description);
  setText(F.day, ad.day);
  setText(F.month, ad.month);
  setText(F.year, ad.year);

  // Body: quote the condition(s) across the ruled lines, pre-wrapped
  // (pdf-lib's own wrapping overflows single-line fields).
  const wrapped: string[] = [];
  paragraphs.forEach((para, i) => {
    if (i > 0) wrapped.push("");
    wrapped.push(...wrapText(para, helvetica, 10, 512));
  });
  if (wrapped.length > F.lines.length) {
    throw new Error(
      `The ${kind === "124" ? "notice" : "waiver"} text needs ${wrapped.length} lines but the form has ${F.lines.length} — shorten the text and try again.`
    );
  }
  F.lines.forEach((name, i) => setText(name, wrapped[i]));

  // DATED line: the day the buyer signs (defaults to today, Toronto).
  const n = deal[key] || {};
  const dated = n.dated || {};
  const dd = dated.date && (dated.date.day || dated.date.month || dated.date.year)
    ? dated.date
    : torontoTodayParts();
  setText(F.dPlace, dated.place || prop.city);
  if (dated.time) setText(F.dTime, String(dated.time));
  setText(F.dDay, dd.day);
  setText(F.dMonth, dd.month);
  setText(F.dYear, dd.year);
  // The signers' printed names under the receipt acknowledgement.
  setText(F.printName, join(deal.buyers));

  const dy = NOTICE_CALIBRATION[kind];
  if (dy) {
    const fields: Record<string, { dy: number }> = {};
    for (const name of [F.buyer, F.seller, F.prop1, F.prop2, F.day, F.month, F.year, ...F.lines, F.dPlace, F.dTime, F.dDay, F.dMonth, F.dYear, F.printName]) {
      fields[name] = { dy };
    }
    applyCalibration(form, { default_dy: 0, fields });
  }
  form.updateFieldAppearances(helvetica);
  const finalDoc = await stripCreatedFieldBackgrounds(doc);
  const bytes = await finalDoc.save();
  return { bytes, pages: 1 };
}

export async function buildForm124(
  deal: any,
  paragraphs: string[],
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildNoticeForm(deal, paragraphs, templateBytes, "124", "fulfillment");
}

export async function buildForm123(
  deal: any,
  paragraphs: string[],
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildNoticeForm(deal, paragraphs, templateBytes, "123", "waiver");
}

// ---------------------------------------------------------------------------
// Form 120 — Amendment to Agreement of Purchase and Sale.
// Header (buyer / seller / agreement date / property) plus the
// Delete: and Insert: ruled areas on page 1 (17 lines each, mapped
// from the blank's geometry 2026-10-22) and the irrevocability on
// page 2. Signatures, acceptance and the acknowledgement blocks are
// completion-time and stay blank.
// ---------------------------------------------------------------------------

const AMEND_DELETE_LINES = [
  "any necessary changes 11",
  "any necessary changes 12",
  "any necessary changes 16",
  "any necessary changes 17",
  "any necessary changes 18",
  "any necessary changes 19",
  "any necessary changes 20",
  "d",
  "ffffff",
  "fffff",
  "z",
  "zz",
  "zzz",
  "dd",
  "ddd",
  "dddd.0",
  "dddd.1",
];
const AMEND_INSERT_LINES = [
  "fff",
  "ffff",
  "ffffffff",
  "g",
  "gg",
  "ggg",
  "dddddd",
  "ddddd",
  "dddddddd",
  "f",
  "ff",
  "h",
  "hhh",
  "hhhh",
  "hh",
  "gggg",
  "ggggg",
];

// Vertical calibration for the 120 / 161 (measured 2026-10-22 audit:
// 120 values floated +2.7, 161 floated +3.4, target +0.5).
const AMEND_CALIBRATION = -2.2;
const DISCLOSURE_CALIBRATION = -2.9;

export function validateAmendment(deal: any): string[] {
  const missing: string[] = [];
  req(deal, "buyers", missing);
  req(deal, "sellers", missing);
  req(deal, "property.address", missing);
  reqDate(deal, "agreement_date", missing);
  const a = deal?.amendment || {};
  const hasDelete = typeof a.delete_text === "string" && a.delete_text.trim().length > 0;
  const hasInsert = typeof a.insert_text === "string" && a.insert_text.trim().length > 0;
  if (!hasDelete && !hasInsert) {
    missing.push("amendment text (what to Delete and/or Insert)");
  }
  return missing;
}

function torontoDayParts(offsetDays: number): { day: string; month: string; year: string } {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return { day: get("day"), month: get("month"), year: get("year").slice(2) };
}

function wrapToLines(
  text: string,
  font: PDFFont,
  fields: string[],
  what: string,
  widths?: number[]
): string[] {
  // Per-line wrap widths (some first lines start after a printed
  // caption and are narrower — an over-wide line makes pdf-lib shrink
  // the font to fit, which reads as a defect).
  const widthAt = (i: number) =>
    widths && widths.length ? widths[Math.min(i, widths.length - 1)] : 512;
  const wrapped: string[] = [];
  const paras = String(text || "")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const para of paras) {
    if (wrapped.length) wrapped.push("");
    // Wrap word by word against the width of the line being filled.
    let cur = "";
    for (const wd of para.split(/\s+/)) {
      const t = cur ? cur + " " + wd : wd;
      if (font.widthOfTextAtSize(t, 10) > widthAt(wrapped.length) && cur) {
        wrapped.push(cur);
        cur = wd;
      } else {
        cur = t;
      }
    }
    if (cur) wrapped.push(cur);
  }
  if (wrapped.length > fields.length) {
    throw new Error(
      `The ${what} needs ${wrapped.length} lines but the form has ${fields.length} — shorten the text and try again.`
    );
  }
  return wrapped;
}

export async function buildForm120(
  deal: any,
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  createdCount = 0;
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const setText = (name: string, value?: string): void => {
    if (!value) return;
    try {
      form.getTextField(name).setText(value);
    } catch {
      // a renamed/absent widget leaves the value out rather than failing
    }
  };
  const join = (arr: string[]) => (arr || []).join(" and ");
  const prop = deal.property || {};
  const ad = deal.agreement_date || {};
  const a = deal.amendment || {};

  setText("BUYER", join(deal.buyers));
  setText("SELLER", join(deal.sellers));
  setText("zzzzz", ad.day);
  setText("zzzz", ad.month);
  setText("for use in the Province of Ontario", ad.year);
  setText("concerning the property known as", [prop.address, prop.city].filter(Boolean).join(", "));
  setText("tt", prop.legal_description);

  const delLines = wrapToLines(a.delete_text, helvetica, AMEND_DELETE_LINES, "Delete text");
  AMEND_DELETE_LINES.forEach((name, i) => setText(name, delLines[i]));
  const insLines = wrapToLines(a.insert_text, helvetica, AMEND_INSERT_LINES, "Insert text");
  AMEND_INSERT_LINES.forEach((name, i) => setText(name, insLines[i]));

  // Irrevocability (page 2): the amending party's deadline for the
  // other side to accept. Defaults: the Buyer, 11:59 p.m. tomorrow.
  const irr = a.irrevocable || {};
  const idd =
    irr.date && (irr.date.day || irr.date.month || irr.date.year)
      ? irr.date
      : torontoDayParts(1);
  setText("SellerBuyer", irr.by || "Buyer");
  setText("ampm", irr.time || "11:59 p.m.");
  setText("ccc", idd.day);
  setText("c", idd.month);
  setText("cc", idd.year);

  if (AMEND_CALIBRATION) {
    const fields: Record<string, { dy: number }> = {};
    for (const name of [
      "BUYER", "SELLER", "zzzzz", "zzzz", "for use in the Province of Ontario",
      "concerning the property known as", "tt",
      ...AMEND_DELETE_LINES, ...AMEND_INSERT_LINES,
      "SellerBuyer", "ampm", "ccc", "c", "cc",
    ]) {
      fields[name] = { dy: AMEND_CALIBRATION };
    }
    applyCalibration(form, { default_dy: 0, fields });
  }
  form.updateFieldAppearances(helvetica);
  const finalDoc = await stripCreatedFieldBackgrounds(doc);
  const bytes = await finalDoc.save();
  return { bytes, pages: 2 };
}

// ---------------------------------------------------------------------------
// Form 161 — Registrant Disclosure of Interest (Disposition).
// Used rarely: when the registrant (or a related person) has an
// interest in the property being sold. Header (registrant /
// designation / brokerage / property), the EXPLANATION of the
// interest, and the disclosure of facts affecting value. Signature,
// date, title and the buyer acknowledgement are signing-time.
// ---------------------------------------------------------------------------

const DISCLOSURE_EXPLANATION_LINES = ["form161.2.1", "form161.3.0", "form161.3.1"];
const DISCLOSURE_FACT_LINES = ["form161.4.0.0", "form161.4.0.1", "form161.4.0.2", "form161.4.0.3"];

export function validateDisclosure(deal: any): string[] {
  const missing: string[] = [];
  req(deal, "property.address", missing);
  const d = deal?.disclosure || {};
  const hasExplanation = typeof d.explanation === "string" && d.explanation.trim().length > 0;
  const hasFacts = typeof d.facts === "string" && d.facts.trim().length > 0;
  if (!hasExplanation && !hasFacts) {
    missing.push("disclosure.explanation (the nature of the interest — or the facts)");
  }
  return missing;
}

export async function buildForm161(
  deal: any,
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  createdCount = 0;
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const setText = (name: string, value?: string): void => {
    if (!value) return;
    try {
      form.getTextField(name).setText(value);
    } catch {
      // a renamed/absent widget leaves the value out rather than failing
    }
  };
  const prop = deal.property || {};
  const d = deal.disclosure || {};
  const sb = deal.selling_brokerage || {};

  setText("form161.0.0", d.registrant || sb.agent);
  setText("form161.0.1", d.designation || "Salesperson");
  setText("form161.1.0", d.brokerage || sb.brokerage);
  setText("form161.1.1", [prop.address, prop.city].filter(Boolean).join(", "));
  setText("form161.2.0", prop.legal_description);

  const expLines = wrapToLines(d.explanation, helvetica, DISCLOSURE_EXPLANATION_LINES, "explanation", [400, 450, 450]);
  DISCLOSURE_EXPLANATION_LINES.forEach((name, i) => setText(name, expLines[i]));
  const factLines = wrapToLines(d.facts, helvetica, DISCLOSURE_FACT_LINES, "disclosure of facts");
  DISCLOSURE_FACT_LINES.forEach((name, i) => setText(name, factLines[i]));

  if (DISCLOSURE_CALIBRATION) {
    const fields: Record<string, { dy: number }> = {};
    for (const name of [
      "form161.0.0", "form161.0.1", "form161.1.0", "form161.1.1", "form161.2.0",
      ...DISCLOSURE_EXPLANATION_LINES, ...DISCLOSURE_FACT_LINES,
    ]) {
      fields[name] = { dy: DISCLOSURE_CALIBRATION };
    }
    applyCalibration(form, { default_dy: 0, fields });
  }
  form.updateFieldAppearances(helvetica);
  const finalDoc = await stripCreatedFieldBackgrounds(doc);
  const bytes = await finalDoc.save();
  return { bytes, pages: 1 };
}

// ---------------------------------------------------------------------------
// Forms 371 / 372 — Buyer / Tenant Designated Representation Agreements.
// The FC Group is always designated representation, so only the
// designated forms (371 buyer, 372 tenant) are wired — never the
// brokerage versions (300/346). Unlike the offer forms, these are
// standalone agreements: the answers live in deal.rep, collected by
// the workspace's Representation section (or the client-file Prepare
// flow). Signature, date-of-signing and initials fields are left
// blank for iinked / ink, exactly like the notice forms.
// Field names were mapped from the blanks' geometry 2026-10-23 (the
// SkySlope auto-names are meaningless — "POSTAL CODE_5" is the expiry
// day — the tables below are keyed by position, verified by a marker
// fill audit). Multi-entry roles repeat the value (page 1 + the
// Schedule A header on page 4) or wrap across ruled lines.
// ---------------------------------------------------------------------------

interface RepFields {
  brokerage_name: string[];
  brokerage_address: string[];
  buyer_name: string[];
  designated_rep: string[];
  property_type_use: string[];
  geographic_location: string[];
  commission_purchase_other: string | string[];
  commission_lease: string | string[];
  buyer_address: string;
  buyer_municipality: string;
  buyer_postal: string;
  brokerage_phone: string;
  term_start_time: string;
  term_start_day: string;
  term_start_month: string;
  term_start_year: string;
  term_end_day: string;
  term_end_month: string;
  term_end_year: string;
  commission_purchase_pct: string;
  holdover_days: string;
  insurance_rep_name: string;
  schedule_a_lines: string[];
}

const REP_FIELDS_371: RepFields = {
  brokerage_name: [
    "ADDRESS 1_1_0_0",
    "BUYER_1_0_0",
  ],
  brokerage_address: [
    "ADDRESS 1_0_0_0",
    "ADDRESS 2_0_0_0",
  ],
  buyer_name: [
    "ADDRESS_1_0_0",
    "BUYER_0_0_0",
  ],
  designated_rep: [
    "DESIGNATED REPRESENTATIVES 1_0_0_0",
    "DESIGNATED REPRESENTATIVES 2_0_0_0",
  ],
  property_type_use: [
    "DESIGNATED REPRESENTATIVES 2_1_0_0",
    "DESIGNATED REPRESENTATIVES 2_2_0_0",
  ],
  geographic_location: [
    "DESIGNATED REPRESENTATIVES 2_3_0_0",
    "DESIGNATED REPRESENTATIVES 2_4_0_0",
  ],
  term_start_time: "POSTAL CODE_1_0_0",
  term_start_day: "POSTAL CODE_2_0_0",
  term_start_month: "POSTAL CODE_3_0_0",
  term_start_year: "POSTAL CODE_4_0_0",
  term_end_day: "POSTAL CODE_5_0_0",
  term_end_month: "POSTAL CODE_6_0_0",
  term_end_year: "POSTAL CODE_7_0_0",
  buyer_address: "ADDRESS_0_0_0",
  buyer_municipality: "MUNICIPALITY_0_0_0",
  buyer_postal: "POSTAL CODE_0_0_0",
  brokerage_phone: "Tel No_0_0_0",
  commission_purchase_pct: "Text1",
  commission_purchase_other: "or_0_0_0",
  commission_lease: "or for a lease a commission of_0_0_0",
  holdover_days: "Text1_8_0_0",
  insurance_rep_name: "DECLARATION OF INSURANCE_0_0_0",
  schedule_a_lines: [
    "asd.0_0_0_0",
    "asd.1_0_0_0",
    "asd.2_0_0_0",
    "asd.3_0_0_0",
    "asd.4_0_0_0",
    "asd.5_0_0_0",
    "asd.6_0_0_0",
    "asd.7_0_0_0",
    "asd.8_0_0_0",
    "asd.9_0_0_0",
    "asd.10_0_0_0",
    "asd.11_0_0_0",
    "asd.12_0_0_0",
    "asd.13_0_0_0",
    "asd.14_0_0_0",
    "asd.15_0_0_0",
    "asd.16_0_0_0",
    "asd.17_0_0_0",
    "asd.18_0_0_0",
    "asd.19_0_0_0",
    "asd.20_0_0_0",
    "asd.21_0_0_0",
    "asd.22_0_0_0",
    "asd.23_0_0_0",
    "asd.24_0_0_0",
    "asd.25_0_0_0",
    "asd.26.0_0_0_0",
    "asd.26.1_0_0_0",
    "asd.26.2_0_0_0",
    "asd.26.3_0_0_0",
    "asd.26.4_0_0_0",
    "asd.26.5_0_0_0",
    "asd.26.6_0_0_0",
    "asd.26.7_0_0_0",
  ],
};

const REP_FIELDS_372: RepFields = {
  brokerage_name: [
    "ADDRESS_1",
    "TENANT_1",
  ],
  brokerage_address: [
    "ADDRESS_0",
    "commencing at_1",
  ],
  buyer_name: [
    "ADDRESS_2_1",
    "TENANT_0",
  ],
  designated_rep: [
    "DESIGNATED REPRESENTATIVES 1_0",
    "DESIGNATED REPRESENTATIVES 2_0",
  ],
  property_type_use: [
    "on the_5",
    "on the_6",
  ],
  geographic_location: [
    "on the_7",
    "on the_8",
  ],
  commission_purchase_other: [
    "of the sale price of the property  or_0",
    "of the sale price of the property  or_1",
  ],
  commission_lease: [
    "If during the currency of this Agreement the Tenant enters into a lease or agreement to lease of the general description indicated above_0",
    "the Tenant agrees that the Brokerage is entitled to be paid a commission of_0",
  ],
  term_start_time: "commencing at_0",
  term_start_day: "on the_0",
  term_start_month: "on the_1",
  term_start_year: "on the_2_3",
  term_end_day: "commencing at_4",
  term_end_month: "on the_3",
  term_end_year: "on the_4",
  buyer_address: "ADDRESS_2_0",
  brokerage_phone: "commencing at_2",
  commission_purchase_pct: "or for an agreement to purchase any property of the general description indicated above the Tenant agrees that the Brokerage is entitled to be paid a_0",
  holdover_days: "of the sale price of the property  or_2",
  insurance_rep_name: "Name of SalespersonBrokerBroker of Record_0",
  schedule_a_lines: [
    "Text3.0_0",
    "Text3.1_0",
    "Text3.2_0",
    "Text3.3_0",
    "Text3.4_0",
    "Text3.5_0",
    "Text3.6_0",
    "Text3.7_0",
    "Text3.8_0",
    "Text3.9_0",
    "Text3.10_0",
    "Text3.11_0",
    "Text3.12_0",
    "Text3.13_0",
    "Text3.14_0",
    "Text3.15_0",
    "Text3.16_0",
    "Text3.17_0",
    "Text3.18_0",
    "Text3.19_0",
    "Text3.20_0",
    "Text3.21_0",
    "Text3.22_0",
    "Text3.23_0",
    "Text3.24_0",
    "Text3.25_0",
    "Text3.26_0",
    "Text3.27_0",
    "Text3.28_0",
    "Text3.29.0_0",
    "Text3.29.1_0",
    "Text3.29.2_0",
    "Text3.29.3_0",
  ],
  buyer_municipality: "",
  buyer_postal: "",
};

export function validateRep(deal: any, kind: "371" | "372"): string[] {
  const missing: string[] = [];
  const rep = deal?.rep || {};
  if (!Array.isArray(rep.clients) || rep.clients.filter(Boolean).length === 0) {
    missing.push(kind === "371" ? "rep.clients (buyer name(s))" : "rep.clients (tenant name(s))");
  }
  if (!Array.isArray(rep.designated_reps) || rep.designated_reps.filter(Boolean).length === 0) {
    missing.push("rep.designated_reps (designated representative(s))");
  }
  reqDate(rep, "term_start", missing);
  reqDate(rep, "term_end", missing);
  if (!rep.geographic_location) missing.push("rep.geographic_location");
  if (!rep.commission_purchase_pct && !rep.commission_purchase_other && !rep.commission_lease) {
    missing.push("rep.commission (a purchase %, an alternate commission, or a lease commission)");
  }
  if (!rep.holdover_days) missing.push("rep.holdover_days");
  return missing;
}

// Wrap a free-text value across a fixed set of ruled-line fields,
// pre-wrapped at each field's own width (pdf-lib's wrapping
// overflows single-line fields). Throws a plain-language error when
// the text cannot fit, like the notice builder.
function fillRuledLines(
  setText: (name: string, value?: string) => void,
  fields: string[],
  widths: number[],
  value: string | undefined,
  font: PDFFont,
  what: string
): void {
  if (!value || !String(value).trim()) return;
  const lines: string[] = [];
  let rest = String(value).trim();
  for (let i = 0; i < fields.length && rest; i++) {
    const wrapped = wrapText(rest, font, 10, widths[i]);
    lines.push(wrapped[0]);
    rest = wrapped.slice(1).join(" ");
  }
  if (rest) {
    throw new Error(`The ${what} is too long for the form — it needs more than ${fields.length} lines. Shorten it and try again.`);
  }
  fields.forEach((name, i) => setText(name, lines[i]));
}

async function buildRepForm(
  deal: any,
  templateBytes: Uint8Array,
  kind: "371" | "372"
): Promise<{ bytes: Uint8Array; pages: number }> {
  createdCount = 0;
  const F = kind === "371" ? REP_FIELDS_371 : REP_FIELDS_372;
  const rep = deal.rep || {};
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const setText = (name: string, value?: string): void => {
    if (!name || value === undefined || value === null || String(value) === "") return;
    try {
      const field = form.getTextField(name);
      field.setText(String(value));
      // The blanks carry DA font size 0 (auto): pdf-lib then scales
      // text to each field's height, which renders oversized and can
      // clip on the taller Schedule A lines (verified on the 372).
      // Pin every filled field to 10pt Helvetica so the rendered size
      // always matches the wrap math.
      try {
        (field as any).acroField.dict.set(PDFName.of("DA"), PDFString.of("/Helv 10 Tf 0 g"));
      } catch {
        // appearance falls back to auto sizing
      }
    } catch {
      // a renamed/absent widget leaves the value out rather than failing
    }
  };
  const setAll = (names: string[], value?: string): void => {
    for (const n of names) setText(n, value);
  };
  const join = (arr: string[]) => (arr || []).filter(Boolean).join(" and ");

  // Header — brokerage (the same value repeats on the Schedule A page).
  setAll(F.brokerage_name, rep.brokerage_name || "RE/MAX HALLMARK FIRST GROUP REALTY LTD.");
  setText(F.brokerage_address[0], rep.brokerage_address);
  if (F.brokerage_address[1]) setText(F.brokerage_address[1], rep.brokerage_address2);
  setText(F.brokerage_phone, rep.brokerage_phone);

  // Client (buyer / tenant).
  setAll(F.buyer_name, join(rep.clients));
  setText(F.buyer_address, rep.client_address);
  setText(F.buyer_municipality, rep.client_municipality);
  setText(F.buyer_postal, rep.client_postal);

  // Designated representative(s) — one per ruled line.
  (rep.designated_reps || []).forEach((r: string, i: number) => setText(F.designated_rep[i], r));
  setText(F.insurance_rep_name, (rep.designated_reps || [])[0]);

  // Term — commencement (time + day/month/year) and expiry (11:59 p.m.
  // is printed on the form; the year blanks follow a printed "20").
  const ts = rep.term_start || {};
  const te = rep.term_end || {};
  setText(F.term_start_time, ts.time);
  setText(F.term_start_day, ts.day);
  setText(F.term_start_month, ts.month);
  setText(F.term_start_year, ts.year);
  setText(F.term_end_day, te.day);
  setText(F.term_end_month, te.month);
  setText(F.term_end_year, te.year);

  // The search description — each value wraps across two ruled lines.
  fillRuledLines(setText, F.property_type_use, [300, 512], rep.property_type_use, helvetica, "property type (use)");
  fillRuledLines(setText, F.geographic_location, [300, 512], rep.geographic_location, helvetica, "geographic location");

  // Commission (¶2). The purchase % blank sits before the printed
  // "% of the sale price", so it takes the bare number.
  setText(F.commission_purchase_pct, rep.commission_purchase_pct);
  const otherFields = Array.isArray(F.commission_purchase_other) ? F.commission_purchase_other : [F.commission_purchase_other];
  fillRuledLines(setText, otherFields, otherFields.map(() => 512), rep.commission_purchase_other, helvetica, "alternate commission");
  const leaseFields = Array.isArray(F.commission_lease) ? F.commission_lease : [F.commission_lease];
  fillRuledLines(setText, leaseFields, leaseFields.map(() => 512), rep.commission_lease, helvetica, "lease commission");
  setText(F.holdover_days, rep.holdover_days);

  // Schedule A (page 4) — free text across the ruled lines.
  if (rep.schedule_a_text && String(rep.schedule_a_text).trim()) {
    const paragraphs = String(rep.schedule_a_text).split(/\n+/).map((s: string) => s.trim()).filter(Boolean);
    const wrapped: string[] = [];
    paragraphs.forEach((para: string, i: number) => {
      if (i > 0) wrapped.push("");
      wrapped.push(...wrapText(para, helvetica, 10, 512));
    });
    if (wrapped.length > F.schedule_a_lines.length) {
      throw new Error(
        `The Schedule A text needs ${wrapped.length} lines but the form has ${F.schedule_a_lines.length} — shorten it and try again.`
      );
    }
    F.schedule_a_lines.forEach((name, i) => setText(name, wrapped[i]));
  }

  form.updateFieldAppearances(helvetica);
  const finalDoc = await stripCreatedFieldBackgrounds(doc);
  const bytes = await finalDoc.save();
  return { bytes, pages: doc.getPageCount() };
}

export async function buildForm371(
  deal: any,
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildRepForm(deal, templateBytes, "371");
}

export async function buildForm372(
  deal: any,
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildRepForm(deal, templateBytes, "372");
}

// ---------------------------------------------------------------------------
// LISTING AGREEMENTS — Form 271 (Seller Designated Representation,
// Authority to Offer for Sale) and Form 272 (Landlord Designated
// Representation, Authority to Offer for Lease). Batch B, 2026-10-23.
// Same conventions as the rep forms: designated representation only,
// signatures/initials/dates-of-signing left blank, field names mapped
// from the blanks' geometry (SkySlope auto-names are meaningless).
// Answers live in deal.listing. The price/rent WORDS line is derived
// from the figures automatically (same number, spelled out) unless a
// price_words override is supplied.
// Note: the 272's renewal/option commission line on page 2 has NO
// fillable field on the blank — cover it in Schedule A if needed.
// ---------------------------------------------------------------------------

const LISTING_SCHED_271: string[] = [
    "Text59.0",
    "Text59.1",
    "Text59.2",
    "Text59.3",
    "Text59.4",
    "Text59.5",
    "Text59.6",
    "Text59.7",
    "Text59.8",
    "Text59.9",
    "Text59.10",
    "Text59.11",
    "Text59.12",
    "Text59.13",
    "Text59.14",
    "Text59.15",
    "Text59.16",
    "Text59.17",
    "Text59.18",
    "Text59.19",
    "Text59.20",
    "Text59.21",
    "Text59.22",
    "Text59.23",
    "Text59.24",
    "Text59.25",
    "Text59.26",
    "Text59.27",
    "Text59.28",
    "Text59.29",
    "Text59.30",
    "Text59.31.0",
    "Text59.31.1",
  ];

const LISTING_SCHED_272: string[] = [
    "Text1.0",
    "Text1.1",
    "Text1.2",
    "Text1.3",
    "Text1.4",
    "Text1.5",
    "Text1.6",
    "Text1.7",
    "Text1.8",
    "Text1.9",
    "Text1.10",
    "Text1.11",
    "Text1.12",
    "Text1.13",
    "Text1.14",
    "Text1.15",
    "Text1.16",
    "Text1.17",
    "Text1.18",
    "Text1.19",
    "Text1.20",
    "Text1.21",
    "Text1.22",
    "Text1.23",
    "Text1.24",
    "Text1.25",
    "Text1.26",
    "Text1.27",
    "Text1.28",
    "Text1.29",
    "Text1.30",
    "Text1.31",
    "Text1.32",
    "Text1.33",
  ];

interface ListingFields {
  brokerage_name: string[];
  brokerage_address: string;
  brokerage_phone: string;
  client_name: string[];
  designated_rep: string[];
  property: string[];
  property_widths: number[];
  term_start_time: string;
  term_start_day: string;
  term_start_month: string;
  term_start_year: string;
  term_end_day: string;
  term_end_month: string;
  term_end_year: string;
  price_figures: string;
  price_words: string;
  commission_total_pct: string;
  commission_total_other: string[];
  commission_total_other_widths: number[];
  commission_total_text: string[];
  commission_total_text_widths: number[];
  commission_coop_pct: string;
  commission_coop_other: string;
  commission_coop_text: string;
  commission_purchase_pct: string;
  commission_purchase_other: string;
  holdover_days: string;
  insurance_rep_name: string;
  schedule_a_lines: string[];
}

const LISTING_FIELDS_271: ListingFields = {
  brokerage_name: ["BROKERAGE 1", "Text47"],
  brokerage_address: "BROKERAGE 2",
  brokerage_phone: "the Listing Brokerage Tel No",
  client_name: ["Text1", "SELLER"],
  designated_rep: ["DESIGNATED REPRESENTATIVES 1", "DESIGNATED REPRESENTATIVES 2"],
  property: [
    "In consideration of the Listing Brokerage listing the real property for sale known as",
    "Text2",
  ],
  property_widths: [246, 477],
  term_start_time: "Text6",
  term_start_day: "Text5",
  term_start_month: "Text4",
  term_start_year: "Text3",
  term_end_day: "Text9",
  term_end_month: "Text8",
  term_end_year: "Text7",
  price_figures: "Text10",
  price_words: "Text11",
  commission_total_pct:
    "for any valid offer to purchase the Property from any source whatsoever obtained during the Listing Period as may be acceptable to the Seller The",
  commission_total_other: ["Text53", "of the sale price of the Property or"],
  commission_total_other_widths: [110, 223],
  commission_total_text: [],
  commission_total_text_widths: [],
  commission_coop_pct: "cooperating brokerage a commission of",
  commission_coop_other: "of the sale price of the Property or_2",
  commission_coop_text: "",
  commission_purchase_pct: "",
  commission_purchase_other: "",
  holdover_days: "Text21",
  insurance_rep_name: "DECLARATION OF INSURANCE",
  schedule_a_lines: LISTING_SCHED_271,
};

const LISTING_FIELDS_272: ListingFields = {
  brokerage_name: ["BROKERAGE 1", "Text2"],
  brokerage_address: "BROKERAGE 2",
  brokerage_phone: "the Brokerage Tel No",
  client_name: ["Text49", "LANDLORD"],
  designated_rep: ["DESIGNATED REPRESENTATIVES 1", "DESIGNATED REPRESENTATIVES 2"],
  property: [
    "In consideration of the Listing Brokerage listing the real property for lease known as",
    "Text7",
  ],
  property_widths: [247, 475],
  term_start_time: "Text8",
  term_start_day: "Text9",
  term_start_month: "Text10",
  term_start_year: "Text11",
  term_end_day: "Text12",
  term_end_month: "Text13",
  term_end_year: "Text14",
  price_figures: "Text17",
  price_words: "Text18",
  commission_total_pct: "",
  commission_total_other: [],
  commission_total_other_widths: [],
  commission_total_text: ["Text22", "Text28"],
  commission_total_text_widths: [260, 292],
  commission_coop_pct: "",
  commission_coop_other: "",
  commission_coop_text: "brokerage and to offer to pay the cooperating brokerage a commission of",
  commission_purchase_pct: "Text29",
  commission_purchase_other: "Text30",
  holdover_days: "Text27",
  insurance_rep_name: "Name of SalespersonBrokerBroker of Record",
  schedule_a_lines: LISTING_SCHED_272,
};

const NUM_ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const NUM_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function numWordsUnder1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(`${NUM_ONES[h]} Hundred`);
  if (rest >= 20) {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    parts.push(o ? `${NUM_TENS[t]}-${NUM_ONES[o]}` : NUM_TENS[t]);
  } else if (rest > 0) {
    parts.push(NUM_ONES[rest]);
  }
  return parts.join(" ");
}

// "784900" -> "Seven Hundred Eighty-Four Thousand Nine Hundred".
// Returns "" when the value is not a plain whole-dollar number.
export function priceToWords(raw: string): string {
  const digits = String(raw || "").replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(digits)) return "";
  let n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "Zero";
  const groups: [number, string][] = [
    [1000000000, "Billion"],
    [1000000, "Million"],
    [1000, "Thousand"],
  ];
  const parts: string[] = [];
  for (const [value, label] of groups) {
    if (n >= value) {
      parts.push(`${numWordsUnder1000(Math.floor(n / value))} ${label}`);
      n = n % value;
    }
  }
  if (n > 0) parts.push(numWordsUnder1000(n));
  return parts.join(" ");
}

export function validateListing(deal: any, kind: "271" | "272"): string[] {
  const missing: string[] = [];
  const L = deal?.listing || {};
  if (!Array.isArray(L.clients) || L.clients.filter(Boolean).length === 0) {
    missing.push(kind === "271" ? "listing.clients (seller name(s))" : "listing.clients (landlord name(s))");
  }
  if (!L.property_address) missing.push("listing.property_address");
  if (!Array.isArray(L.designated_reps) || L.designated_reps.filter(Boolean).length === 0) {
    missing.push("listing.designated_reps (designated representative(s))");
  }
  reqDate(L, "term_start", missing);
  reqDate(L, "term_end", missing);
  if (!L.price) missing.push(kind === "271" ? "listing.price (list price)" : "listing.price (rent)");
  if (kind === "271") {
    if (!L.commission_total_pct && !L.commission_total_other) {
      missing.push("listing.commission_total (a total commission % or alternate wording)");
    }
  } else if (!L.commission_total) {
    missing.push("listing.commission_total (the total commission wording)");
  }
  if (!L.holdover_days) missing.push("listing.holdover_days");
  return missing;
}

async function buildListingForm(
  deal: any,
  templateBytes: Uint8Array,
  kind: "271" | "272"
): Promise<{ bytes: Uint8Array; pages: number }> {
  createdCount = 0;
  const F = kind === "271" ? LISTING_FIELDS_271 : LISTING_FIELDS_272;
  const L = deal.listing || {};
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const setText = (name: string, value?: string): void => {
    if (!name || value === undefined || value === null || String(value) === "") return;
    try {
      const field = form.getTextField(name);
      field.setText(String(value));
      try {
        (field as any).acroField.dict.set(PDFName.of("DA"), PDFString.of("/Helv 10 Tf 0 g"));
      } catch {
        // appearance falls back to auto sizing
      }
    } catch {
      // a renamed/absent widget leaves the value out rather than failing
    }
  };
  const setAll = (names: string[], value?: string): void => {
    for (const n of names) setText(n, value);
  };
  const join = (arr: string[]) => (arr || []).filter(Boolean).join(" and ");

  // Header — brokerage (name repeats on the Schedule A page).
  setAll(F.brokerage_name, L.brokerage_name || "RE/MAX HALLMARK FIRST GROUP REALTY LTD.");
  setText(F.brokerage_address, L.brokerage_address);
  setText(F.brokerage_phone, L.brokerage_phone);

  // Client (seller / landlord) + designated reps.
  setAll(F.client_name, join(L.clients));
  (L.designated_reps || []).forEach((r: string, i: number) => setText(F.designated_rep[i], r));
  setText(F.insurance_rep_name, (L.designated_reps || [])[0]);

  // Property — wraps across the two ruled lines after "known as".
  fillRuledLines(setText, F.property, F.property_widths, L.property_address, helvetica, "property address");
  // Schedule A header property line (same value, unwrapped).
  setText("PROPERTY", L.property_address);

  // Term.
  const ts = L.term_start || {};
  const te = L.term_end || {};
  setText(F.term_start_time, ts.time);
  setText(F.term_start_day, ts.day);
  setText(F.term_start_month, ts.month);
  setText(F.term_start_year, ts.year);
  setText(F.term_end_day, te.day);
  setText(F.term_end_month, te.month);
  setText(F.term_end_year, te.year);

  // Price / rent — figures as given; words derived unless overridden.
  setText(F.price_figures, L.price);
  const words = L.price_words || priceToWords(L.price || "");
  if (words) setText(F.price_words, words);

  // Commission.
  if (kind === "271") {
    setText(F.commission_total_pct, L.commission_total_pct);
    fillRuledLines(
      setText,
      F.commission_total_other,
      F.commission_total_other_widths,
      L.commission_total_other,
      helvetica,
      "alternate total commission"
    );
    setText(F.commission_coop_pct, L.commission_coop_pct);
    setText(F.commission_coop_other, L.commission_coop_other);
  } else {
    fillRuledLines(
      setText,
      F.commission_total_text,
      F.commission_total_text_widths,
      L.commission_total,
      helvetica,
      "total commission"
    );
    setText(F.commission_coop_text, L.commission_coop);
    setText(F.commission_purchase_pct, L.commission_purchase_pct);
    setText(F.commission_purchase_other, L.commission_purchase_other);
  }
  setText(F.holdover_days, L.holdover_days);

  // Schedule A (page 4) — free text across the ruled lines.
  if (L.schedule_a_text && String(L.schedule_a_text).trim()) {
    const paragraphs = String(L.schedule_a_text).split(/\n+/).map((s: string) => s.trim()).filter(Boolean);
    const wrapped: string[] = [];
    paragraphs.forEach((para: string, i: number) => {
      if (i > 0) wrapped.push("");
      wrapped.push(...wrapText(para, helvetica, 10, 512));
    });
    if (wrapped.length > F.schedule_a_lines.length) {
      throw new Error(
        `The Schedule A text needs ${wrapped.length} lines but the form has ${F.schedule_a_lines.length} — shorten it and try again.`
      );
    }
    F.schedule_a_lines.forEach((name, i) => setText(name, wrapped[i]));
  }

  form.updateFieldAppearances(helvetica);
  const finalDoc = await stripCreatedFieldBackgrounds(doc);
  const bytes = await finalDoc.save();
  return { bytes, pages: doc.getPageCount() };
}

export async function buildForm271(
  deal: any,
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildListingForm(deal, templateBytes, "271");
}

export async function buildForm272(
  deal: any,
  templateBytes: Uint8Array
): Promise<{ bytes: Uint8Array; pages: number }> {
  return buildListingForm(deal, templateBytes, "272");
}

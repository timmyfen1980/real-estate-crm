/* eslint-disable @typescript-eslint/no-explicit-any */
// Beth's Hours — invoice PDF (session auth; Beth or the owner).
// GET /api/hours/invoice/[id]/pdf — a clean invoice from Beth Nickle to
// Tim Fennessey Personal Real Estate Corporation, built with pdf-lib.
// The HST line (with her HST number) prints only when the invoice has one.

import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  BETH_EMAIL,
  BETH_NAME,
  BETH_PHONE,
  BETH_USER_ID,
  BILL_TO_NAME,
  FC_ACCOUNT_ID,
  requireHoursAccess,
  toNum,
} from '@/lib/contractorHours';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Format a stored YYYY-MM-DD date without any timezone shifting.
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  const month = MONTHS[parseInt(parts[1], 10) - 1] || parts[1];
  return `${month} ${parseInt(parts[2], 10)}, ${parts[0]}`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fmtDate(iso);
  return d.toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function money(n: number): string {
  return `$${n.toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// pdf-lib standard fonts are WinAnsi only — fold common punctuation to
// ASCII and drop anything else outside Latin-1.
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/•/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireHoursAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    const supabase = ctx.supabase;

    const { id } = await params;

    const { data: invoice, error: invoiceError } = await supabase
      .from('contractor_invoices')
      .select(
        'id, invoice_number, period_start, period_end, total_hours, rate, subtotal, hst_number, hst_amount, total, status, issued_at, paid_at'
      )
      .eq('id', id)
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID)
      .single();
    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const { data: entries, error: entriesError } = await supabase
      .from('contractor_time_entries')
      .select('id, work_date, hours, note')
      .eq('invoice_id', id)
      .eq('account_id', FC_ACCOUNT_ID)
      .eq('user_id', BETH_USER_ID)
      .order('work_date', { ascending: true })
      .order('created_at', { ascending: true });
    if (entriesError) throw entriesError;

    const rate = toNum(invoice.rate);
    const subtotal = toNum(invoice.subtotal);
    const hstAmount = toNum(invoice.hst_amount);
    const total = toNum(invoice.total);
    const hasHst = Boolean(invoice.hst_number) && hstAmount > 0;

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.059, 0.165, 0.267); // #0f2a44
    const red = rgb(0.82, 0.149, 0.188); // #d22630
    const dark = rgb(0.15, 0.15, 0.15);
    const gray = rgb(0.42, 0.42, 0.42);
    const lightLine = rgb(0.85, 0.85, 0.85);

    let page = doc.addPage([612, 792]);
    const rightEdge = 562;
    let y = 742;

    const drawRight = (
      text: string,
      yy: number,
      size: number,
      f: typeof font,
      color: typeof dark
    ) => {
      const w = f.widthOfTextAtSize(text, size);
      page.drawText(text, { x: rightEdge - w, y: yy, size, font: f, color });
    };

    // Header
    page.drawText('INVOICE', { x: 50, y, size: 28, font: bold, color: navy });
    drawRight(`Invoice #${invoice.invoice_number}`, y + 12, 13, bold, dark);
    drawRight(`Date: ${fmtDateTime(invoice.issued_at)}`, y - 8, 11, font, gray);
    y -= 14;
    page.drawLine({
      start: { x: 50, y },
      end: { x: rightEdge, y },
      thickness: 2.5,
      color: red,
    });
    y -= 36;

    // From / Bill to
    page.drawText('FROM', { x: 50, y, size: 9, font: bold, color: gray });
    page.drawText('BILL TO', { x: 320, y, size: 9, font: bold, color: gray });
    y -= 18;
    page.drawText(BETH_NAME, { x: 50, y, size: 13, font: bold, color: dark });
    page.drawText(BILL_TO_NAME, { x: 320, y, size: 11.5, font: bold, color: dark });
    y -= 16;
    page.drawText('Client Care Coordinator (contractor)', {
      x: 50, y, size: 10.5, font, color: dark,
    });
    y -= 15;
    page.drawText(`${BETH_EMAIL} - ${BETH_PHONE}`, {
      x: 50, y, size: 10.5, font, color: dark,
    });
    y -= 26;

    page.drawText(
      `Work period: ${fmtDate(invoice.period_start)} to ${fmtDate(invoice.period_end)}`,
      { x: 50, y, size: 11, font, color: dark }
    );
    y -= 10;
    page.drawText(
      invoice.status === 'paid'
        ? `Status: PAID${invoice.paid_at ? ` on ${fmtDateTime(invoice.paid_at)}` : ''}`
        : 'Status: Unpaid',
      { x: 50, y: y - 14, size: 11, font: bold, color: invoice.status === 'paid' ? rgb(0.08, 0.45, 0.16) : red }
    );
    y -= 44;

    // Table header
    const colDate = 50;
    const colNote = 135;
    const colHours = 415;
    const colRate = 470;
    page.drawLine({ start: { x: 50, y: y + 16 }, end: { x: rightEdge, y: y + 16 }, thickness: 0.75, color: lightLine });
    page.drawText('Date', { x: colDate, y, size: 10, font: bold, color: gray });
    page.drawText('What the work was', { x: colNote, y, size: 10, font: bold, color: gray });
    page.drawText('Hours', { x: colHours, y, size: 10, font: bold, color: gray });
    page.drawText('Rate', { x: colRate, y, size: 10, font: bold, color: gray });
    drawRight('Amount', y, 10, bold, gray);
    y -= 8;
    page.drawLine({ start: { x: 50, y }, end: { x: rightEdge, y }, thickness: 0.75, color: lightLine });
    y -= 20;

    const newPageIfNeeded = () => {
      if (y < 120) {
        page = doc.addPage([612, 792]);
        y = 742;
      }
    };

    for (const e of entries || []) {
      newPageIfNeeded();
      const hours = toNum(e.hours);
      const amount = Math.round(hours * rate * 100) / 100;
      page.drawText(fmtDate(e.work_date), { x: colDate, y, size: 10.5, font, color: dark });
      let note = safe(e.note || '');
      const maxNoteWidth = colHours - colNote - 14;
      while (note.length > 0 && font.widthOfTextAtSize(note, 10.5) > maxNoteWidth) {
        note = note.slice(0, -2);
      }
      if (note) {
        page.drawText(note, { x: colNote, y, size: 10.5, font, color: dark });
      }
      page.drawText(hours.toFixed(2), { x: colHours, y, size: 10.5, font, color: dark });
      page.drawText(money(rate), { x: colRate, y, size: 10.5, font, color: dark });
      drawRight(money(amount), y, 10.5, font, dark);
      y -= 19;
    }

    y -= 6;
    page.drawLine({ start: { x: 50, y }, end: { x: rightEdge, y }, thickness: 0.75, color: lightLine });
    y -= 24;

    // Totals
    const totalLabelX = 380;
    const totalRow = (label: string, value: string, size: number, f: typeof font, color: typeof dark) => {
      page.drawText(label, { x: totalLabelX, y, size, font: f, color });
      drawRight(value, y, size, f, color);
      y -= 19;
    };
    totalRow('Subtotal', money(subtotal), 11.5, font, dark);
    if (hasHst) {
      totalRow(`HST (13%) - HST #${invoice.hst_number}`, money(hstAmount), 11.5, font, dark);
    }
    totalRow('Total due', money(total), 14, bold, navy);

    y -= 22;
    page.drawText(`Total hours: ${toNum(invoice.total_hours).toFixed(2)} at ${money(rate)} per hour.`, {
      x: 50, y, size: 10.5, font, color: gray,
    });
    y -= 30;
    page.drawText('Thank you!', { x: 50, y, size: 11, font, color: gray });

    const pdfBytes = await doc.save();
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="beth-nickle-invoice-${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

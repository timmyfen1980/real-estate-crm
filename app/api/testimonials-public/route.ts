/* eslint-disable @typescript-eslint/no-explicit-any */
// Public testimonials route for thefcgroup.ca/testimonials.
// GET  — the approved testimonials (what the website displays).
// POST — a client submits one review { name, label, rating, body }.
//        It is stored as 'pending' and only appears after the team
//        approves it in the CRM. The team is notified by email.

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const DEFAULT_ACCOUNT_ID = 'a540905b-7cd7-4dd6-bba0-162c07978bd6';

const ALLOWED_ORIGINS = [
  'https://www.thefcgroup.ca',
  'https://thefcgroup.ca',
  'https://finwise-saas-landing-page-chi-five.vercel.app',
  'https://crm.thefcgroup.ca',
];

function getCorsHeaders(origin: string | null, methods: string) {
  const safeOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'https://www.thefcgroup.ca';
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
  } as Record<string, string>;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req.headers.get('origin'), 'GET, POST, OPTIONS'),
  });
}

export async function GET(req: Request) {
  const headers = getCorsHeaders(req.headers.get('origin'), 'GET, POST, OPTIONS');
  try {
    const { data, error } = await supabaseAdmin
      .from('testimonials')
      .select('id, author_name, author_label, rating, body, source, created_at')
      .eq('account_id', DEFAULT_ACCOUNT_ID)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ testimonials: data || [] }, { headers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers });
  }
}

export async function POST(req: Request) {
  const headers = getCorsHeaders(req.headers.get('origin'), 'GET, POST, OPTIONS');
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const text = String(body?.body || '').trim();
    // Honeypot: real clients never fill this hidden field.
    if (body?.company) {
      return NextResponse.json({ ok: true }, { headers });
    }
    if (!name || text.length < 10) {
      return NextResponse.json(
        { error: 'Please add your name and a few words about your experience.' },
        { status: 400, headers }
      );
    }
    const rating = Math.min(5, Math.max(1, parseInt(body?.rating, 10) || 5));
    const label = String(body?.label || '').trim().slice(0, 120);

    const { error } = await supabaseAdmin.from('testimonials').insert({
      account_id: DEFAULT_ACCOUNT_ID,
      author_name: name.slice(0, 120),
      author_label: label || null,
      rating,
      body: text.slice(0, 4000),
      source: 'website',
      status: 'pending',
    });
    if (error) throw error;

    // Notify the team (best effort — the submission itself is saved).
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'The FC Group <info@thefcgroup.ca>',
        to: 'info@thefcgroup.ca',
        subject: `New testimonial to review — ${name}`,
        html:
          `<p><strong>${name}</strong>${label ? ` (${label})` : ''} left a ${rating}-star testimonial on the website:</p>` +
          `<blockquote style="margin:12px 0; padding:12px 16px; background:#f6f6f6; border-left:3px solid #d22630;">${text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')}</blockquote>` +
          '<p>Approve it in the CRM under Testimonials and it will appear on thefcgroup.ca/testimonials.</p>',
      });
    } catch {
      // Notification is best-effort.
    }

    return NextResponse.json({ ok: true }, { headers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers });
  }
}

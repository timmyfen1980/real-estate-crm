/* eslint-disable @typescript-eslint/no-explicit-any */
// Testimonials manager route (session auth; any FC Group team member).
// GET  /api/testimonials — every testimonial, newest first.
// POST /api/testimonials — actions:
//   { action: 'create', author_name, author_label, rating, body, source }
//       → adds a testimonial by hand, already approved.
//   { action: 'set_status', id, status }  status: pending|approved|hidden
//   { action: 'set_social', id, social_url } → records where it was posted
//   { action: 'delete', id }

import { NextRequest, NextResponse } from 'next/server';
import { FC_ACCOUNT_ID, requireTeamAccess } from '@/lib/testimonials';

const SELECT =
  'id, author_name, author_label, rating, body, source, status, social_url, created_at, updated_at';

export async function GET() {
  try {
    const auth = await requireTeamAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const { data, error } = await ctx.supabase
      .from('testimonials')
      .select(SELECT)
      .eq('account_id', FC_ACCOUNT_ID)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ testimonials: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTeamAccess();
    if (!auth.ok) return auth.response;
    const { ctx } = auth;
    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'create') {
      const authorName = String(body.author_name || '').trim();
      const text = String(body.body || '').trim();
      if (!authorName || !text) {
        return NextResponse.json(
          { error: 'A name and the testimonial text are both required.' },
          { status: 400 }
        );
      }
      const rating = Math.min(5, Math.max(1, parseInt(body.rating, 10) || 5));
      const { data, error } = await ctx.supabase
        .from('testimonials')
        .insert({
          account_id: FC_ACCOUNT_ID,
          author_name: authorName.slice(0, 120),
          author_label: String(body.author_label || '').trim().slice(0, 120) || null,
          rating,
          body: text.slice(0, 4000),
          source: String(body.source || 'manual').slice(0, 30),
          status: 'approved',
        })
        .select(SELECT)
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, testimonial: data });
    }

    const id = String(body.id || '');
    if (!id) {
      return NextResponse.json({ error: 'Missing testimonial id.' }, { status: 400 });
    }

    if (action === 'set_status') {
      const status = String(body.status || '');
      if (!['pending', 'approved', 'hidden'].includes(status)) {
        return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
      }
      const { error } = await ctx.supabase
        .from('testimonials')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('account_id', FC_ACCOUNT_ID)
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'set_social') {
      const { error } = await ctx.supabase
        .from('testimonials')
        .update({
          social_url: String(body.social_url || '').slice(0, 500) || null,
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', FC_ACCOUNT_ID)
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete') {
      const { error } = await ctx.supabase
        .from('testimonials')
        .delete()
        .eq('account_id', FC_ACCOUNT_ID)
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

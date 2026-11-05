import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

// GET /api/brand-images/members — the signed-in user's team, for the Brand
// Images page. Returns every member of the caller's account with their
// current signature photo (agent_photo_url), owner first, so the page can
// render one headshot card per person — including future agents, who appear
// automatically once they have an account.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    if (!membership) {
      return NextResponse.json({ members: [] });
    }
    const accountId = (membership as any).account_id;

    const { data: rows } = await supabase
      .from('account_users')
      .select('user_id, role')
      .eq('account_id', accountId);
    const roleById = new Map<string, string>();
    (rows || []).forEach((r: any) => roleById.set(r.user_id, r.role || ''));
    const ids = Array.from(roleById.keys());
    if (!ids.length) {
      return NextResponse.json({ members: [] });
    }

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, agent_photo_url')
      .in('id', ids);
    if (error) throw error;

    const members = (profiles || []).slice().sort((a: any, b: any) => {
      const ao = roleById.get(a.id) === 'owner' ? 0 : 1;
      const bo = roleById.get(b.id) === 'owner' ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });

    return NextResponse.json({ members });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to load team.' },
      { status: 500 }
    );
  }
}

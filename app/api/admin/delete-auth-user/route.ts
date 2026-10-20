/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/admin/delete-auth-user — admin cleanup of a half-deleted user.
// Body: { email }
// Auth: Bearer <REA_AGENT_SECRET> header.
// Deletes the Supabase Auth user plus any leftover profiles / account_users rows
// so the email can be registered again cleanly.
// Returns a summary of what was found and deleted.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token !== process.env.REA_AGENT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const email = (body.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Email required.' }, { status: 400 });
    }

    // 1. Find the auth user by email (paginate through listUsers; small user base)
    let authUserId: string | null = null;
    let page = 1;
    const perPage = 200;
    while (!authUserId) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(`listUsers: ${error.message}`);
      const users = data?.users || [];
      if (users.length === 0) break;
      const match = users.find((u) => (u.email || '').toLowerCase() === email);
      if (match) {
        authUserId = match.id;
        break;
      }
      if (users.length < perPage) break;
      page += 1;
      if (page > 20) break; // safety stop
    }

    // 2. Collect user ids that may have leftover rows: the auth user id plus
    //    any profiles rows still carrying this email.
    const userIds = new Set<string>();
    if (authUserId) userIds.add(authUserId);

    const { data: profilesByEmail, error: profErr } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email);
    if (profErr) throw new Error(`profiles lookup: ${profErr.message}`);
    for (const p of profilesByEmail || []) userIds.add(p.id);

    // 3. Delete account memberships for those user ids
    let accountUsersDeleted = 0;
    if (userIds.size > 0) {
      const { error, count } = await supabase
        .from('account_users')
        .delete({ count: 'exact' })
        .in('user_id', Array.from(userIds));
      if (error) throw new Error(`account_users: ${error.message}`);
      accountUsersDeleted = count || 0;
    }

    // 4. Delete leftover profile rows (by id set, then any remaining email match)
    let profilesDeleted = 0;
    if (userIds.size > 0) {
      const { error, count } = await supabase
        .from('profiles')
        .delete({ count: 'exact' })
        .in('id', Array.from(userIds));
      if (error) throw new Error(`profiles: ${error.message}`);
      profilesDeleted = count || 0;
    }
    const { error: profEmailErr, count: profEmailCount } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .ilike('email', email);
    if (profEmailErr) throw new Error(`profiles by email: ${profEmailErr.message}`);
    profilesDeleted += profEmailCount || 0;

    // 5. Delete the Supabase Auth user itself
    let authUserDeleted = false;
    if (authUserId) {
      const { error } = await supabase.auth.admin.deleteUser(authUserId);
      if (error) throw new Error(`deleteUser: ${error.message}`);
      authUserDeleted = true;
    }

    return NextResponse.json({
      ok: true,
      email,
      auth_user_found: !!authUserId,
      auth_user_id: authUserId,
      auth_user_deleted: authUserDeleted,
      profiles_deleted: profilesDeleted,
      account_users_deleted: accountUsersDeleted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Cleanup failed.' }, { status: 500 });
  }
}

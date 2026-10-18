import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// POST /api/agent/create-team-user — creates a Supabase Auth user for a new
// team member, links them to Tim's team account with role 'agent', and ensures
// a profiles row — mirroring the app's own invite-code join flow
// (app/signup/page.tsx), but usable before the member's email mailbox exists.
// The user is created email-confirmed so they can log in immediately.
// Bearer-gated with REA_AGENT_SECRET.
// Body: { "email": "...", "password": "...", "full_name": "..." }
// The password is used once for creation and never stored.
const TIM_EMAIL = 'tim@thefcgroup.ca';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || '';
  const secret = process.env.REA_AGENT_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { email, password, full_name } = await request.json();
  if (!email || !password) {
    return NextResponse.json(
      { error: 'email and password are required' },
      { status: 400 }
    );
  }
  const normEmail = String(email).toLowerCase().trim();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Tim's team account (the one Beth joins).
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }
  const users = userList?.users || [];
  const timUser = users.find(
    (u: any) => u.email?.toLowerCase() === TIM_EMAIL
  );
  if (!timUser) {
    return NextResponse.json({ error: 'tim user not found' }, { status: 500 });
  }
  const { data: membership } = await supabase
    .from('account_users')
    .select('account_id')
    .eq('user_id', timUser.id)
    .limit(1)
    .single();
  if (!membership?.account_id) {
    return NextResponse.json({ error: 'tim account not found' }, { status: 500 });
  }
  const accountId = membership.account_id;

  // Create (or reuse) the auth user — confirmed, so no verification email needed.
  let userId: string | null = null;
  let created = false;
  const existing = users.find(
    (u: any) => u.email?.toLowerCase() === normEmail
  );
  if (existing) {
    userId = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: normEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: full_name || '' },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    userId = data.user.id;
    created = true;
  }

  // Team membership — same as the signup join flow.
  const { data: existingMembership } = await supabase
    .from('account_users')
    .select('id')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!existingMembership) {
    const { error } = await supabase.from('account_users').insert([
      { user_id: userId, account_id: accountId, role: 'agent' },
    ]);
    if (error) {
      return NextResponse.json(
        { error: 'membership: ' + error.message },
        { status: 500 }
      );
    }
  }

  // Profile row — same as the signup flow.
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (!existingProfile) {
    await supabase
      .from('profiles')
      .insert([{ id: userId, full_name: full_name || '' }]);
  } else if (full_name) {
    await supabase
      .from('profiles')
      .update({ full_name })
      .eq('id', userId);
  }

  return NextResponse.json({
    success: true,
    created,
    user_id: userId,
    account_id: accountId,
    email: normEmail,
    role: 'agent',
  });
}

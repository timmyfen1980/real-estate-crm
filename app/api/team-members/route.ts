import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('accountId')

  if (!accountId) {
    return NextResponse.json({ error: 'Missing accountId' }, { status: 400 })
  }

  const { data: accountUsers, error: accountError } = await supabaseAdmin
    .from('account_users')
    .select('user_id')
    .eq('account_id', accountId)

  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 500 })
  }

  const userIds = accountUsers.map((u) => u.user_id)

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json(profiles)
}
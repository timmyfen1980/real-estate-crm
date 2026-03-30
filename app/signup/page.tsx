'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

function generateInviteCode() {
  return 'ACC-' + Math.random().toString(36).substring(2, 8).toUpperCase()
}

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [fullName, setFullName] = useState('')
  const [brokerage, setBrokerage] = useState('')
  const [phone, setPhone] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignup = async () => {
    if (loading) return
    setLoading(true)
    setError(null)

    if (!email || !password) {
      setError('Email and password are required.')
      setLoading(false)
      return
    }

    if (!fullName) {
  setError('Full name is required.')
  setLoading(false)
  return
}

    // Create auth user with metadata
const { data: authData, error: authError } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      full_name: fullName || null,
      phone: phone || null,
    },
  },
})

if (authError) {
  setError(authError.message)
  setLoading(false)
  return
}

// Always fetch user after signup
const {
  data: { user },
} = await supabase.auth.getUser()

if (!user) {
  setError('User not available yet. Please try logging in.')
  setLoading(false)
  return
}

const { data: existingProfile } = await supabase
  .from('profiles')
  .select('id')
  .eq('id', user.id)
  .maybeSingle()

if (!existingProfile) {
  const { error: profileError } = await supabase
    .from('profiles')
    .insert([
      {
        id: user.id,
        full_name: fullName || '',
      },
    ])

  if (profileError) {
    console.error('Profile insert error:', profileError)
  }
}// =============================
// UNIFIED CREATE / JOIN FLOW
// =============================
let accountId: string | null = null

if (inviteCode) {
  // JOIN FLOW
  const { data: accountData, error: accountError } = await supabase
    .from('accounts')
    .select('id')
    .eq('invite_code', inviteCode.toUpperCase())
    .single()

  if (accountError || !accountData) {
    setError('Invalid invite code.')
    setLoading(false)
    return
  }

  accountId = accountData.id

  const { data: existingMembership } = await supabase
    .from('account_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existingMembership) {
    const { error: membershipError } = await supabase
      .from('account_users')
      .insert([
        {
          user_id: user.id,
          account_id: accountId,
          role: 'agent',
        },
      ])

    if (membershipError) {
      setError('Membership insert failed: ' + membershipError.message)
      setLoading(false)
      return
    }
  }

} else {
  // CREATE FLOW
  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (existingAccount) {
    accountId = existingAccount.id
  } else {
    const newInviteCode = generateInviteCode()

    const { data: accountData, error: accountError } = await supabase
      .from('accounts')
      .insert([
        {
          name: fullName,
          brokerage_name: brokerage || null,
          phone: phone || null,
          invite_code: newInviteCode,
          owner_user_id: user.id,
          owner_email: user.email,
          logo_url: null
        },
      ])
      .select()
      .single()

    if (accountError || !accountData) {
      setError(accountError?.message || 'Account creation failed.')
      setLoading(false)
      return
    }

    accountId = accountData.id
  }

  const { data: existingMembership } = await supabase
    .from('account_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existingMembership && accountId) {
    const { error: membershipError } = await supabase
      .from('account_users')
      .insert([
        {
          user_id: user.id,
          account_id: accountId,
          role: 'owner',
        },
      ])

    if (membershipError) {
      setError("Membership insert failed: " + membershipError.message)
      setLoading(false)
      return
    }
  }
}

setLoading(false)

router.refresh()
router.push('/dashboard/account')
}

return (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
    <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-8">

      <h1 className="text-2xl font-bold mb-6 text-center">
        Create Account
      </h1>

      <div className="space-y-4 mt-6">

        <input
          className="w-full p-3 border rounded-lg"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full p-3 border rounded-lg"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <input
          className="w-full p-3 border rounded-lg"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <input
          className="w-full p-3 border rounded-lg"
          placeholder="Brokerage Name (Optional)"
          value={brokerage}
          onChange={(e) => setBrokerage(e.target.value)}
        />

        <input
          className="w-full p-3 border rounded-lg"
          placeholder="Phone (Optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <input
          className="w-full p-3 border rounded-lg"
          placeholder="Invite Code (Optional)"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
        />

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          onClick={handleSignup}
          disabled={loading}
          className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Continue'}
        </button>

      </div>
    </div>
  </div>
)
}
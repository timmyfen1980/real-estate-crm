'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setError(null)

    if (!email || !password) {
      setError('Email and password are required.')
      return
    }

    setLoading(true)

    const { data, error: loginError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    if (loginError || !data.user) {
      setError(loginError?.message || 'Login failed.')
      setLoading(false)
      return
    }

    if (!data.user.email_confirmed_at) {
      router.push('/verify-email')
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-8">

        <h1 className="text-2xl font-bold mb-6 text-center">
          Sign In
        </h1>

        <div className="space-y-4">

          <input
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-black focus:outline-none"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-black focus:outline-none"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
<a
  href="/forgot-password"
  className="block text-center text-sm text-gray-500 underline mt-2"
>
  Forgot your password?
</a>
          <button          
  onClick={() => window.location.href = '/signup'}
  className="w-full text-sm text-gray-500 underline"
>
  Create an Account
</button>

        </div>
      </div>
    </div>
  )
}
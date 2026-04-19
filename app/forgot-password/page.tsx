'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleReset = async () => {
    setError('')
    setMessage('')

    if (!email) {
      setError('Please enter your email.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSent(true)
    setMessage('If an account exists with that email, a reset link has been sent. Redirecting to login...')

    setTimeout(() => {
      window.location.href = '/login'
    }, 3000)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-8">

        <h1 className="text-2xl font-bold mb-2 text-center">
          Reset Password
        </h1>

        <p className="text-sm text-gray-500 text-center mb-6">
          Enter your email and we’ll send you a reset link.
        </p>

        <div className="space-y-4">

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sent}
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-black focus:outline-none disabled:bg-gray-100"
          />

          {error && (
            <p className="text-sm text-red-600 text-center">
              {error}
            </p>
          )}

          {message && (
            <p className="text-sm text-green-600 text-center">
              {message}
            </p>
          )}

          <button
            onClick={handleReset}
            disabled={loading || sent}
            className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
          >
            {loading
              ? 'Sending...'
              : sent
              ? 'Email Sent'
              : 'Send Reset Link'}
          </button>

          <button
            onClick={() => (window.location.href = '/login')}
            className="w-full text-sm text-gray-500 underline"
          >
            Back to Login
          </button>

        </div>
      </div>
    </div>
  )
}
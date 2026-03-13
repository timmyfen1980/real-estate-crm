'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function VerifyEmailPage() {
  const router = useRouter()

  const [email, setEmail] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setEmail(user.email || null)

      if (user.email_confirmed_at) {
        router.push('/dashboard/open-houses')
        return
      }

      setChecking(false)
    }

    checkUser()

    const interval = setInterval(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user?.email_confirmed_at) {
        router.push('/dashboard/open-houses')
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [router])

  const resendConfirmation = async () => {
    if (!email) return

    setResending(true)
    setMessage(null)

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Confirmation email resent.')
    }

    setResending(false)
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Checking verification...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-8 text-center">

        <h1 className="text-2xl font-bold mb-4">
          Verify Your Email
        </h1>

        <p className="text-gray-600 mb-6">
          We sent a confirmation link to:
        </p>

        <p className="font-semibold mb-6">
          {email}
        </p>

        <p className="text-sm text-gray-500 mb-6">
          Please check your inbox and click the verification link.
        </p>

        <button
          onClick={resendConfirmation}
          disabled={resending}
          className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
        >
          {resending ? 'Sending...' : 'Resend Confirmation Email'}
        </button>

        {message && (
          <p className="text-sm mt-4 text-gray-600">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
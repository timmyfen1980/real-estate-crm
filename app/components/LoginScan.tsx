'use client'

// LoginScan — invisible login trigger for the catch-up scans
// (checklist #2). Mounted once by the dashboard layout; on mount it
// POSTs /api/login-scan so lead/task state and email follow-ups are
// fresh right after sign-in instead of waiting for the hourly scans.
// The route enforces a per-user 30-minute cooldown server-side; the
// sessionStorage guard here just keeps in-app navigation from
// re-firing it within the same browser session. Renders nothing and
// ignores the response and any error — deliberately no UI.

import { useEffect } from 'react'

const SESSION_KEY = 'rea-login-scan-fired'

export default function LoginScan() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) return
      window.sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      // sessionStorage unavailable (rare) — fire anyway; the route's
      // cooldown is the real gate.
    }
    fetch('/api/login-scan', { method: 'POST' }).catch(() => {})
  }, [])

  return null
}

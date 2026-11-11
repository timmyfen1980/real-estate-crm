'use client'

// GuidedTour — drives the look-and-learn tour defined in
// lib/tourSteps.ts (Tim, 2026-11-11: guided tour inside the real
// system, replacing the practice demo). Mounted once in the
// dashboard layout. The tour navigates between pages and rings the
// step's target element; it NEVER clicks, submits, or sends
// anything. State lives in localStorage (fc-tour-active /
// fc-tour-step) so it survives the page changes it causes.
//
// Start it by setting those keys + dispatching a 'fc-tour:start'
// window event (the Help & Training page and the dashboard's
// "New here?" line both do this), or just by setting the keys —
// the next layout mount picks them up.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react'
import { TOUR_STEPS } from '@/lib/tourSteps'

const NAVY = '#0f2a44'
const RED = '#d22630'

const ACTIVE_KEY = 'fc-tour-active'
const STEP_KEY = 'fc-tour-step'

interface RingRect {
  top: number
  left: number
  width: number
  height: number
}

export default function GuidedTour() {
  const router = useRouter()
  const pathname = usePathname()
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<RingRect | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
  }

  const endTour = useCallback(() => {
    clearTimers()
    try {
      window.localStorage.removeItem(ACTIVE_KEY)
      window.localStorage.removeItem(STEP_KEY)
    } catch {
      /* private mode — nothing to clear */
    }
    setRect(null)
    setActive(false)
  }, [])

  const startTour = useCallback(() => {
    try {
      window.localStorage.setItem(ACTIVE_KEY, '1')
      window.localStorage.setItem(STEP_KEY, '0')
    } catch {
      /* private mode — tour still runs for this mount */
    }
    setStep(0)
    setActive(true)
  }, [])

  // Pick up persisted state on mount; listen for start requests.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(ACTIVE_KEY) === '1') {
        const saved = Number(window.localStorage.getItem(STEP_KEY) || '0')
        setStep(Number.isFinite(saved) && saved >= 0 && saved < TOUR_STEPS.length ? saved : 0)
        setActive(true)
      }
    } catch {
      /* ignore */
    }
    const onStart = () => startTour()
    window.addEventListener('fc-tour:start', onStart)
    return () => window.removeEventListener('fc-tour:start', onStart)
  }, [startTour])

  const gotoStep = useCallback(
    (n: number) => {
      const clamped = Math.max(0, Math.min(n, TOUR_STEPS.length - 1))
      try {
        window.localStorage.setItem(STEP_KEY, String(clamped))
      } catch {
        /* ignore */
      }
      setRect(null)
      setStep(clamped)
    },
    []
  )

  // On step/route change: navigate to the step's page if needed,
  // then find + ring its target. A missing target is fine — the
  // card simply shows on its own. Nothing here may throw.
  useEffect(() => {
    if (!active) return
    const s = TOUR_STEPS[step]
    if (!s) {
      endTour()
      return
    }
    if (pathname !== s.route) {
      router.push(s.route)
      return
    }
    clearTimers()
    const measure = () => {
      try {
        if (!s.target) {
          setRect(null)
          return
        }
        const el = document.querySelector(s.target)
        if (!el) {
          setRect(null)
          return
        }
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } catch {
        setRect(null)
      }
    }
    timers.current.push(
      setTimeout(() => {
        try {
          if (s.target) {
            const el = document.querySelector(s.target)
            if (el) el.scrollIntoView({ block: 'center' })
          }
        } catch {
          /* ignore */
        }
      }, 450)
    )
    timers.current.push(setTimeout(measure, 800))
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimers()
    }
  }, [active, step, pathname, router, endTour])

  if (!active) return null
  const s = TOUR_STEPS[step]
  if (!s) return null
  const isLast = step === TOUR_STEPS.length - 1

  return (
    <>
      {rect && (
        <div
          aria-hidden
          className="fixed z-40 pointer-events-none rounded-xl"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            border: `3px solid ${RED}`,
            boxShadow: '0 0 0 4px rgba(210,38,48,0.18), 0 8px 30px rgba(15,42,68,0.25)',
          }}
        />
      )}

      <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-2.5 text-white"
          style={{ backgroundColor: NAVY }}
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Compass size={14} />
            Guided tour · Step {step + 1} of {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={endTour}
            aria-label="End tour"
            className="text-white/70 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3.5">
          <div className="font-semibold mb-1" style={{ color: NAVY }}>
            {s.title}
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
        </div>

        <div className="px-4 pb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => gotoStep(step - 1)}
            disabled={step === 0}
            className="inline-flex items-center gap-1 text-sm border rounded-full px-3.5 py-1.5 transition disabled:opacity-40 hover:bg-gray-100"
            style={{ borderColor: NAVY, color: NAVY }}
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <button
            type="button"
            onClick={endTour}
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            End tour
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={endTour}
              className="inline-flex items-center gap-1 text-sm font-medium text-white rounded-full px-4 py-1.5 transition hover:opacity-90"
              style={{ backgroundColor: RED }}
            >
              Finish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => gotoStep(step + 1)}
              className="inline-flex items-center gap-1 text-sm font-medium text-white rounded-full px-4 py-1.5 transition hover:opacity-90"
              style={{ backgroundColor: RED }}
            >
              Next
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </>
  )
}

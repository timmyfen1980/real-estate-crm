'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Help & Training — the browsing door to the same guide the Rea chat
// teaches from (lib/helpContent). Searchable module library, role
// quick-start cards, What's New, and the team overlay. "Teach me this"
// hands the module to the Rea chat (bottom-right) via a
// 'rea-chat:ask' window event, and Rea walks it one step at a time.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  LifeBuoy,
  MessageCircle,
  Search,
  Sparkles,
} from 'lucide-react'
import {
  HELP_MODULES,
  QUICK_STARTS,
  TEAM_OVERLAY,
  WHATS_NEW,
  type HelpAudience,
  type HelpModule,
} from '@/lib/helpContent'

const NAVY = '#0f2a44'
const RED = '#d22630'

const AUDIENCE_FILTERS: { key: HelpAudience | 'everyone'; label: string }[] = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'agent', label: 'Agents' },
  { key: 'coordinator', label: 'Coordinators' },
  { key: 'admin', label: 'Admin / Team Lead' },
]

function askRea(message: string) {
  window.dispatchEvent(new CustomEvent('rea-chat:ask', { detail: { message } }))
}

function ModuleCard({
  module,
  open,
  onToggle,
}: {
  module: HelpModule
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-3 hover:bg-gray-50 transition"
      >
        <span>
          <span className="block font-semibold" style={{ color: NAVY }}>
            {module.title}
          </span>
          <span className="block text-sm text-gray-500 mt-0.5">{module.summary}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] uppercase tracking-wide text-gray-400 border rounded-full px-2 py-0.5">
            {module.audience === 'all' ? 'Everyone' : module.audience}
          </span>
          {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t">
          {module.body.split('\n\n').map((para, i) => (
            <p key={i} className="text-sm text-gray-700 leading-relaxed mb-3">
              {para}
            </p>
          ))}

          <div className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
            Step by step
          </div>
          <ol className="space-y-2 mb-4">
            {module.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-gray-700 leading-relaxed">
                <span
                  className="shrink-0 h-5 w-5 rounded-full text-white text-[11px] font-semibold flex items-center justify-center mt-0.5"
                  style={{ backgroundColor: NAVY }}
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="rounded-lg bg-[#0f2a44]/5 border border-[#0f2a44]/10 px-4 py-3 mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: NAVY }}>
              Try it
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{module.tryIt}</p>
          </div>

          {module.watchOut.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 mb-4">
              <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: RED }}>
                Watch out
              </div>
              <ul className="list-disc pl-4 space-y-1">
                {module.watchOut.map((w, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-relaxed">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => askRea(`Teach me: ${module.title}`)}
              className="inline-flex items-center gap-1.5 text-sm text-white rounded-full px-4 py-2 transition hover:opacity-90"
              style={{ backgroundColor: RED }}
            >
              <GraduationCap size={16} />
              Teach me this
            </button>
            <Link
              href={module.link}
              className="inline-flex items-center gap-1.5 text-sm border rounded-full px-4 py-2 transition hover:bg-[#0f2a44] hover:text-white"
              style={{ borderColor: NAVY, color: NAVY }}
            >
              {module.linkLabel}
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default function HelpPage() {
  const [query, setQuery] = useState('')
  const [audience, setAudience] = useState<HelpAudience | 'everyone'>('everyone')
  const [openId, setOpenId] = useState<string | null>('golden-rules')

  const modules = useMemo(() => {
    const terms = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1)
    return HELP_MODULES.filter((m) => {
      if (audience !== 'everyone' && m.audience !== 'all' && m.audience !== audience) return false
      if (!terms.length) return true
      const hay = `${m.title} ${m.summary} ${m.body} ${m.keywords.join(' ')}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [query, audience])

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-2">
        <span
          className="h-11 w-11 rounded-xl text-white flex items-center justify-center shrink-0"
          style={{ backgroundColor: NAVY }}
        >
          <LifeBuoy size={22} />
        </span>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Help &amp; Training
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            The whole coaching guide, inside the CRM. Read a module here, or tap{' '}
            <strong>Teach me this</strong> and Rea (bottom-right) walks you through it one step
            at a time while you do it. You can also just ask Rea any “how do I…” question.
          </p>
        </div>
      </div>

      <button
        onClick={() => askRea('How do I get started? Teach me the golden rules.')}
        className="inline-flex items-center gap-1.5 text-sm border rounded-full px-4 py-2 mb-8 transition hover:bg-[#0f2a44] hover:text-white"
        style={{ borderColor: NAVY, color: NAVY }}
      >
        <MessageCircle size={15} />
        Ask Rea instead
      </button>

      {/* Practice demo — the training sandbox. Entering signs the user
          in as Dana Mercer, the demo broker of "Demo Realty Group" (a
          separate practice account): see /api/demo/enter. */}
      <div className="bg-white border rounded-xl shadow-sm p-5 mb-10">
        <h2 className="text-lg font-bold mb-2 flex items-center gap-2" style={{ color: NAVY }}>
          <GraduationCap size={18} /> Practice Demo — learn by doing
        </h2>
        <p className="text-sm text-gray-600 mb-2">
          A complete practice copy of the CRM, loaded with a pretend brokerage —{' '}
          <strong>Demo Realty Group</strong> — its own clients, leads, client files, tasks and
          open houses. Work through the modules below in there: click anything, file anything,
          make mistakes. Nothing in the practice demo is real, and it can never email a real
          person.
        </p>
        <p className="text-sm text-gray-600 mb-4">
          The button signs you in as <strong>Dana Mercer</strong>, the demo broker, so you see
          the whole system the way an owner would. When you&apos;re done practising, sign out
          (top right) and sign back in as yourself — your real account is exactly where you
          left it. If the practice data gets messy, ask Tim or Rea to reset it.
        </p>
        <a
          href="/api/demo/enter"
          className="inline-flex items-center gap-2 text-sm font-medium text-white rounded-full px-5 py-2.5 transition hover:opacity-90"
          style={{ backgroundColor: NAVY }}
        >
          <GraduationCap size={16} />
          Enter the practice demo
          <ArrowRight size={15} />
        </a>
      </div>

      {/* Quick start cards */}
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
        <BookOpen size={18} /> Quick Start — by role
      </h2>
      <div className="grid gap-4 md:grid-cols-3 mb-10">
        {QUICK_STARTS.map((qs) => (
          <div key={qs.role} className="bg-white border rounded-xl shadow-sm p-5">
            <div className="font-semibold" style={{ color: NAVY }}>
              {qs.title}
            </div>
            <p className="text-sm text-gray-500 mt-1 mb-3">{qs.blurb}</p>
            <ol className="space-y-2">
              {qs.steps.map((s, i) => (
                <li key={i}>
                  <Link
                    href={s.link}
                    className="flex gap-2 text-sm text-gray-700 leading-snug hover:text-[#d22630] transition"
                  >
                    <span className="shrink-0 font-semibold" style={{ color: RED }}>
                      {i + 1}.
                    </span>
                    <span className="underline-offset-2 hover:underline">{s.label}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {/* Module library */}
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
        <GraduationCap size={18} /> The Guide — module library
      </h2>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <label className="flex items-center gap-2 flex-1 bg-white border rounded-full px-4 py-2">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide — try “fintrac”, “stop”, “checklist”…"
            className="flex-1 outline-none text-sm bg-transparent"
          />
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {AUDIENCE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setAudience(f.key)}
              className={
                audience === f.key
                  ? 'text-sm text-white rounded-full px-3.5 py-2 transition'
                  : 'text-sm border rounded-full px-3.5 py-2 transition hover:bg-gray-100'
              }
              style={audience === f.key ? { backgroundColor: NAVY } : undefined}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 mb-10">
        {modules.map((m) => (
          <ModuleCard
            key={m.id}
            module={m}
            open={openId === m.id}
            onToggle={() => setOpenId(openId === m.id ? null : m.id)}
          />
        ))}
        {modules.length === 0 && (
          <div className="bg-white border rounded-xl p-6 text-sm text-gray-500">
            No module matches that search. Try fewer words — or ask Rea (bottom-right) in plain
            language; she searches the same guide.
          </div>
        )}
      </div>

      {/* Team overlay */}
      <h2 className="text-lg font-bold mb-1" style={{ color: NAVY }}>
        Our team&apos;s rules
      </h2>
      <p className="text-sm text-gray-500 mb-3">
        {TEAM_OVERLAY.team}. {TEAM_OVERLAY.intro}
      </p>
      <div className="bg-white border rounded-xl shadow-sm p-5 mb-10">
        <ul className="space-y-3">
          {TEAM_OVERLAY.rules.map((r) => (
            <li key={r.title} className="text-sm text-gray-700 leading-relaxed">
              <strong style={{ color: NAVY }}>{r.title}.</strong> {r.text}
            </li>
          ))}
        </ul>
      </div>

      {/* What's New */}
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
        <Sparkles size={18} /> What&apos;s New
      </h2>
      <div className="space-y-3 mb-10">
        {WHATS_NEW.map((w, i) => (
          <div key={i} className="bg-white border rounded-xl shadow-sm p-5">
            <div className="text-xs uppercase tracking-wide text-gray-400">{w.date}</div>
            <div className="font-semibold mt-0.5" style={{ color: NAVY }}>
              {w.title}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mt-1">{w.text}</p>
          </div>
        ))}
      </div>

      {/* Still stuck */}
      <div className="rounded-xl border border-dashed p-5 text-sm text-gray-600 leading-relaxed bg-white/60">
        <strong style={{ color: NAVY }}>Still stuck?</strong> Note the page you were on and what
        you were trying to do, and contact your team lead — they&apos;ll get you unstuck or pass
        it along. (A built-in support form will live here later; for now, a message to your team
        lead with the page name is the fastest route.)
      </div>
    </div>
  )
}

'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
// ReaChat — Rea, in the bottom-right corner of every CRM page.
// Talks to /api/rea-chat, which answers from live CRM data (tasks,
// leads, closings, listings) and runs the guided offer intake: say or
// type "put together a buyer package and an offer for 123 Main Street"
// and Rea builds the package, asking only what's still needed — by
// voice (Web Speech API), typing, or tapping a suggested answer.

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MessageCircle, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react'

interface ChatLink {
  label: string
  href: string
}

interface Msg {
  role: 'user' | 'assistant'
  content: string
  links?: ChatLink[]
  suggestions?: string[]
}

const GREETING: Msg = {
  role: 'assistant',
  content:
    "Hi, I'm Rea. Ask me what's due, who's gone quiet, or what's closing — or tap the mic and say \"put together a buyer package and an offer for 123 Main Street\" and I'll build it with you, one question at a time. You can also ask me how anything in the CRM works — say \"teach me client files\" and I'll walk you through it, one step at a time.",
}

const CHIPS = [
  "What's due for me?",
  'Which of my leads need attention?',
  "What's closing soon?",
  'Put together a buyer package and an offer',
  'Teach me client files',
  'Teach me FINTRAC forms',
]

// "Help with this page" — maps the page the user is standing on to the
// help topic that covers it, so the chip can ask about that topic.
const PAGE_TOPICS: [string, string][] = [
  ['/dashboard/checklists', 'client files and checklists'],
  ['/dashboard/offers', 'offers'],
  ['/dashboard/leads', 'leads'],
  ['/dashboard/contacts', 'contacts'],
  ['/dashboard/tasks', 'tasks'],
  ['/dashboard/open-houses', 'open houses'],
  ['/dashboard/lead-campaigns', 'lead campaigns'],
  ['/dashboard/campaigns', 'email drips, follow-ups and the newsletter'],
  ['/dashboard/brand-images', 'brand images'],
  ['/dashboard/beth-hours', 'my hours and invoices'],
  ['/dashboard/giveaway', 'the giveaway'],
]

function topicForPath(pathname: string | null): string | null {
  if (!pathname) return null
  const hit = PAGE_TOPICS.find(([prefix]) => pathname.startsWith(prefix))
  return hit ? hit[1] : null
}

export default function ReaChat() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // The offer package this conversation is building, once Rea starts one.
  // Sent back on every message so the intake stays pinned to that package
  // (the server also re-derives it from the conversation as a fallback).
  const [packageId, setPackageId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Voice: speech-to-text for answers (Web Speech API), and an optional
  // read-aloud toggle for Rea's questions. Both degrade gracefully —
  // no mic support just means typing and tapping, which work the same.
  const [listening, setListening] = useState(false)
  const [voiceOk, setVoiceOk] = useState(false)
  const [speak, setSpeak] = useState(false)
  const recogRef = useRef<any>(null)
  const finalRef = useRef('')
  const sendRef = useRef<(text: string) => void>(() => {})

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open, busy])

  useEffect(() => {
    const w = window as any
    setVoiceOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition))
    return () => {
      try {
        recogRef.current?.abort()
      } catch {
        /* already stopped */
      }
      window.speechSynthesis?.cancel()
    }
  }, [])

  // Read Rea's newest message aloud when the speaker toggle is on.
  useEffect(() => {
    if (!speak || !open) return
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(last.content)
    u.lang = 'en-CA'
    window.speechSynthesis.speak(u)
  }, [messages, speak, open])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/rea-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          package_id: packageId || undefined,
        }),
      })
      const data = await res.json()
      if (data && data.ok) {
        const pkgLink = (data.links || []).find((l: ChatLink) =>
          /\/dashboard\/offers\/[0-9a-fA-F-]{36}/.test(l.href)
        )
        if (pkgLink) {
          const m = pkgLink.href.match(/\/dashboard\/offers\/([0-9a-fA-F-]{36})/)
          if (m) setPackageId(m[1])
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply || 'Done.',
            links: data.links,
            suggestions: data.suggestions,
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Something went wrong on my side — try me again.' },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "I couldn't be reached just now — try again in a moment." },
      ])
    } finally {
      setBusy(false)
    }
  }

  sendRef.current = send

  // Help & Training page bridge: anything on the page can ask Rea a
  // question by dispatching window CustomEvent('rea-chat:ask',
  // { detail: { message } }) — the panel opens and the message sends
  // itself, so "Teach me this" buttons start a walkthrough hands-free.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      const text = typeof detail.message === 'string' ? detail.message.trim() : ''
      if (!text) return
      setOpen(true)
      // Give the panel a beat to open before sending through the ref
      // (sendRef always points at the latest send, so no stale state).
      setTimeout(() => sendRef.current(text), 60)
    }
    window.addEventListener('rea-chat:ask', handler)
    return () => window.removeEventListener('rea-chat:ask', handler)
  }, [])

  const stopListening = () => {
    try {
      recogRef.current?.stop()
    } catch {
      /* not running */
    }
  }

  const startListening = () => {
    const w = window as any
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor || listening) return
    // Don't let the mic hear Rea's own read-aloud.
    window.speechSynthesis?.cancel()
    const rec = new Ctor()
    rec.lang = 'en-CA'
    rec.interimResults = true
    rec.continuous = false
    finalRef.current = ''
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalRef.current += r[0].transcript
        else interim += r[0].transcript
      }
      setInput((finalRef.current + interim).trim())
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => {
      setListening(false)
      const said = finalRef.current.trim()
      finalRef.current = ''
      // A spoken answer sends itself — hands-free, like dictating.
      if (said) sendRef.current(said)
    }
    recogRef.current = rec
    setListening(true)
    try {
      rec.start()
    } catch {
      setListening(false)
    }
  }

  const openLink = (href: string) => {
    if (href.startsWith('http')) {
      window.open(href, '_blank')
    } else {
      router.push(href)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#0f2a44] text-white pl-4 pr-5 py-3 rounded-full shadow-xl hover:bg-[#173863] transition"
        aria-label="Chat with Rea"
      >
        <MessageCircle size={20} />
        <span className="font-semibold text-sm">Rea</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] h-[560px] max-h-[75vh] bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden">
      <div className="bg-[#0f2a44] text-white px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">Rea</div>
          <div className="text-xs text-blue-200">Your CRM assistant</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (speak) window.speechSynthesis?.cancel()
              setSpeak(!speak)
            }}
            className="p-1 hover:bg-white/10 rounded"
            aria-label={speak ? 'Turn read-aloud off' : 'Read answers aloud'}
            title={speak ? 'Read-aloud on' : 'Read my answers aloud'}
          >
            {speak ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1 hover:bg-white/10 rounded"
            aria-label="Close chat"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'bg-[#0f2a44] text-white rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap'
                  : 'bg-white border rounded-2xl rounded-bl-sm px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap shadow-sm'
              }
            >
              {m.content}
              {m.links && m.links.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.links.map((l, j) => (
                    <button
                      key={j}
                      onClick={() => openLink(l.href)}
                      className="block w-full text-left text-xs border border-[#0f2a44] text-[#0f2a44] rounded-md px-2 py-1.5 hover:bg-[#0f2a44] hover:text-white transition bg-white"
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.suggestions.map((s, j) => (
                    <button
                      key={j}
                      onClick={() => send(s)}
                      disabled={busy}
                      className="text-xs border border-[#d22630] text-[#d22630] rounded-full px-2.5 py-1 hover:bg-[#d22630] hover:text-white transition bg-white disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-white border rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-gray-500 shadow-sm">
              Rea is checking…
            </div>
          </div>
        )}
      </div>

      {messages.length === 1 && (
        <div className="px-3 py-2 flex flex-wrap gap-1.5 border-t bg-white">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => send(chip)}
              className="text-xs border rounded-full px-2.5 py-1 hover:bg-gray-100 transition"
            >
              {chip}
            </button>
          ))}
          {topicForPath(pathname) && (
            <button
              onClick={() => send(`Help with this page — how do I use the ${topicForPath(pathname)} part of the CRM?`)}
              className="text-xs border border-[#0f2a44] text-[#0f2a44] rounded-full px-2.5 py-1 hover:bg-[#0f2a44] hover:text-white transition"
            >
              Help with this page
            </button>
          )}
        </div>
      )}

      <form
        className="border-t p-2 flex gap-2 bg-white"
        onSubmit={(e) => {
          e.preventDefault()
          stopListening()
          send(input)
        }}
      >
        <input
          className="flex-1 border rounded-full px-3 py-2 text-sm outline-none focus:border-[#0f2a44]"
          placeholder={listening ? 'Listening… speak now' : voiceOk ? 'Ask Rea, or tap the mic…' : 'Ask Rea…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {voiceOk && (
          <button
            type="button"
            onClick={() => (listening ? stopListening() : startListening())}
            className={
              listening
                ? 'bg-[#d22630] text-white rounded-full p-2.5 animate-pulse'
                : 'border text-[#0f2a44] rounded-full p-2.5 hover:bg-gray-100 transition'
            }
            aria-label={listening ? 'Stop listening' : 'Answer by voice'}
            title={listening ? 'Listening — tap to stop' : 'Tap and speak your answer'}
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-[#d22630] text-white rounded-full p-2.5 hover:bg-[#b31e28] transition disabled:opacity-50"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </form>
      {!voiceOk && (
        <div className="px-3 pb-2 bg-white text-[11px] text-gray-400">
          Voice input isn't available in this browser — typing and tapping work the same.
        </div>
      )}
    </div>
  )
}

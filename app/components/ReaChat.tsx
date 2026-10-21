'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
// ReaChat — Rea, in the bottom-right corner of every CRM page.
// Talks to /api/rea-chat, which answers from live CRM data (tasks,
// leads, closings, listings) and can hand off to the offer workspace.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Send, X } from 'lucide-react'

interface ChatLink {
  label: string
  href: string
}

interface Msg {
  role: 'user' | 'assistant'
  content: string
  links?: ChatLink[]
}

const GREETING: Msg = {
  role: 'assistant',
  content:
    "Hi, I'm Rea. Ask me what's due, who's gone quiet, what's closing, or say \"prepare an offer\" and I'll point you to the workspace.",
}

const CHIPS = [
  "What's due for me?",
  'Which of my leads need attention?',
  "What's closing soon?",
  'Prepare an offer',
]

export default function ReaChat() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open, busy])

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
        }),
      })
      const data = await res.json()
      if (data && data.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.reply || 'Done.', links: data.links },
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
        <button
          onClick={() => setOpen(false)}
          className="p-1 hover:bg-white/10 rounded"
          aria-label="Close chat"
        >
          <X size={18} />
        </button>
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
        </div>
      )}

      <form
        className="border-t p-2 flex gap-2 bg-white"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <input
          className="flex-1 border rounded-full px-3 py-2 text-sm outline-none focus:border-[#0f2a44]"
          placeholder="Ask Rea…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-[#d22630] text-white rounded-full p-2.5 hover:bg-[#b31e28] transition disabled:opacity-50"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}

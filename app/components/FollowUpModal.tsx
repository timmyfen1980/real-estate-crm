'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type TemplateKey =
  | 'open_house'
  | 'drip'
  | 'intro'
  | 'general'
  | 'price_change'
  | 'new_listing'
  | 'seller_update'

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  open_house: 'Open house follow-up',
  drip: 'Drip check-in',
  intro: 'Intro',
  general: 'General check-in',
  price_change: 'Price change',
  new_listing: 'New listing match',
  seller_update: 'Seller area update',
}

type LeadInfo = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  status: string
  deal_type: string | null
  property_id: string | null
  contact_id: string | null
  working_with_realtor: boolean | null
  realtor_name: string | null
}

function buildTemplate(
  key: TemplateKey,
  lead: LeadInfo,
  address: string | null
): { subject: string; body: string } {
  switch (key) {
    case 'open_house': {
      // Deliberately personal (Tim, 2026-10-21): no mention of the visit —
      // they've already had 1-2 automated emails; this one must read like
      // Tim typed it himself, and its job is to win them as a client.
      return {
        subject: 'Helping you find the right home',
        body: `I just wanted to reach out personally — I'd like to help you find the right home.

Scrolling through listings can be a grind, and half of them aren't what they look like online. Tell me what matters most to you — area, size, budget, the must-haves — and I'll do the hunting. I watch new listings as they come up, and I'll only send you the ones that are genuinely worth a look.

And there's no pressure or obligation. If you just want honest advice on where the market's heading or what a home is really worth, I'm happy to be a resource.

What does the right home look like for you?`,
      }
    }
    case 'new_listing': {
      return {
        subject: 'This one made me think of you',
        body: `Came across a new listing and you were the first person I thought of — [address/link].

From what you told me you're looking for, it checks a lot of the boxes. Want me to send you the details, or set up a time to go see it?`,
      }
    }
    case 'seller_update': {
      return {
        subject: 'Homes near you are moving',
        body: `Quick note — there's been some real activity in your area lately, and homes like yours are getting a lot of attention.

If you've thought about selling at all, even just curiosity about what yours would go for in this market, I'm happy to put an updated number together for you. No obligation, just information.`,
      }
    }
    case 'drip': {
      const looking =
        (lead.deal_type || '').toLowerCase() === 'seller'
          ? 'selling your home'
          : 'finding the right home'
      return {
        subject: 'Just checking in',
        body: `It's been a little while since we last connected, so I wanted to reach out personally.

Are you still thinking about ${looking}? The market has been moving, and there may be some good options worth a look right now.

Happy to send a few things over that fit what you're after, or just talk through timing — whatever's most helpful.`,
      }
    }
    case 'price_change': {
      const place = address || 'a home you viewed'
      return {
        subject: `Price update: ${place}`,
        body: `Quick note — the price on ${place} has just been adjusted.

I know you're working with another agent, and I completely respect that. I only wanted you to have the update, since you'd shown interest in the home.

Feel free to pass it along to your realtor, or reach out if you'd like any details.`,
      }
    }
    case 'intro': {
      return {
        subject: 'Thanks for reaching out',
        body: `Thanks for getting in touch — I appreciate you thinking of the Fennessey Comeau Group.

I'd love to hear a bit more about what you're looking for and your timing. Even a short call helps me point you in the right direction.

When's a good time for a quick chat?`,
      }
    }
    default: {
      return {
        subject: 'Checking in',
        body: `Just wanted to check in and see how things are going.

If you're thinking about a move — or you just have questions about the market — I'm happy to help however I can.

Talk soon?`,
      }
    }
  }
}

export default function FollowUpModal({
  leadId,
  onClose,
  onSent,
}: {
  leadId: string
  onClose: () => void
  onSent?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [lead, setLead] = useState<LeadInfo | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [templateKey, setTemplateKey] = useState<TemplateKey>('general')
  const [suggestedKey, setSuggestedKey] = useState<TemplateKey>('general')
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [sentInfo, setSentInfo] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: leadData } = await supabase
        .from('leads')
        .select(
          'id, first_name, last_name, email, status, deal_type, property_id, contact_id, working_with_realtor, realtor_name'
        )
        .eq('id', leadId)
        .single()

      if (!leadData) {
        setError('Could not load this lead.')
        setLoading(false)
        return
      }

      const info = leadData as LeadInfo
      setLead(info)
      setTo(info.email || '')

      let addr: string | null = null
      if (info.property_id) {
        const { data: prop } = await supabase
          .from('properties')
          .select('address')
          .eq('id', info.property_id)
          .maybeSingle()
        addr = prop?.address || null
        setAddress(addr)
      }

      const { data: attendances } = await supabase
        .from('open_house_attendances')
        .select('id')
        .eq('lead_id', leadId)
        .limit(1)

      let hasDrip = false
      if (info.contact_id) {
        const { data: enroll } = await supabase
          .from('contact_campaigns')
          .select('id')
          .eq('contact_id', info.contact_id)
          .eq('status', 'active')
          .limit(1)
        hasDrip = !!(enroll && enroll.length > 0)
      }

      let key: TemplateKey = 'general'
      if (info.working_with_realtor) key = 'price_change'
      else if (attendances && attendances.length > 0) key = 'open_house'
      else if (hasDrip) key = 'drip'
      else if (info.status === 'New') key = 'intro'
      else if ((info.deal_type || '').toLowerCase() === 'seller')
        key = 'seller_update'

      setSuggestedKey(key)
      setTemplateKey(key)
      const t = buildTemplate(key, info, addr)
      setSubject(t.subject)
      setBodyText(t.body)
      setLoading(false)
    }

    load()
  }, [leadId])

  const pickTemplate = (key: TemplateKey) => {
    if (!lead) return
    setTemplateKey(key)
    const t = buildTemplate(key, lead, address)
    setSubject(t.subject)
    setBodyText(t.body)
  }

  const send = async () => {
    if (!lead) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/lead-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          to,
          subject,
          body_text: bodyText,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'The email could not be sent — please try again.')
        setSending(false)
        return
      }
      setSentInfo(data.next_followup_date || null)
      setSent(true)
      setSending(false)
      setTimeout(() => {
        if (onSent) onSent()
        else onClose()
      }, 1400)
    } catch {
      setError('The email could not be sent — please try again.')
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 rounded-lg w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-semibold">
            Follow up{lead ? ` — ${lead.first_name} ${lead.last_name}` : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : sent ? (
          <div className="text-center py-8 space-y-2">
            <div className="text-3xl">✓</div>
            <p className="font-medium">Email sent</p>
            <p className="text-sm text-gray-500">
              Logged on the lead, last contact updated, next follow-up set
              {sentInfo ? ` for ${sentInfo}` : ''}. Any open check-in task
              for them is now complete.
            </p>
          </div>
        ) : (
          <>
            {lead?.working_with_realtor && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                ⚠ {lead.first_name} is working with another realtor
                {lead.realtor_name ? ` (${lead.realtor_name})` : ''}. The
                only email these leads should get is a price-change update
                on the home they viewed.
              </div>
            )}

            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                Suggested: {TEMPLATE_LABELS[suggestedKey]} — switch if you like
                (switching replaces the draft)
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TEMPLATE_LABELS) as TemplateKey[]).map(k => (
                  <button
                    key={k}
                    onClick={() => pickTemplate(k)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition ${
                      templateKey === k
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {TEMPLATE_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">To</label>
              <input
                type="email"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="w-full border p-2 rounded"
                placeholder="No email on file"
              />
              {!to && (
                <p className="text-xs text-red-600 mt-1">
                  This lead has no email address — add one to send.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full border p-2 rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Message</label>
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                rows={10}
                className="w-full border p-2 rounded text-sm leading-relaxed"
              />
              <p className="text-xs text-gray-400 mt-1">
                Sent with the team header, a “Hi {lead?.first_name || ''},”
                greeting, and the assigned agent's signature — you only
                write the middle.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-between">
              <button
                onClick={onClose}
                className="px-4 py-2 border rounded"
                disabled={sending}
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={sending || !to || !subject.trim() || !bodyText.trim()}
                className="px-5 py-2 bg-[#0f2a44] text-white rounded disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send email'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

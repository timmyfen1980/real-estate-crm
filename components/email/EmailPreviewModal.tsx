'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Props = {
  isOpen: boolean
  onCloseAction: () => void
  html: string
  subject: string
  bodyHtml: string
  ctaText: string | null
  ctaLink: string | null
}

type Contact = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  tags: string[] | null
  lifecycle_stage: string | null
  do_not_contact: boolean | null
  email_opt_in: boolean | null
}

type Step = 'preview' | 'audience' | 'confirm'

export default function EmailPreviewModal({
  isOpen,
  onCloseAction,
  html,
  subject,
  bodyHtml,
  ctaText,
  ctaLink,
}: Props) {
  const [step, setStep] = useState<Step>('preview')
  const [sendingTest, setSendingTest] = useState(false)

  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // Load contacts
  useEffect(() => {
    if (step !== 'audience') return

    const load = async () => {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: membership } = await supabase
        .from('account_users')
        .select('account_id')
        .eq('user_id', user.id)
        .single()

      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('account_id', membership?.account_id)
        .eq('is_deleted', false)

      const { data: subs } = await supabase
        .from('contact_subscriptions')
        .select('contact_id, unsubscribed')

      const unsubMap: Record<string, boolean> = {}
      subs?.forEach(s => unsubMap[s.contact_id] = s.unsubscribed)

      const filtered = (data || []).filter(c => {
        if (!c.email) return false
        if (c.do_not_contact) return false
        if (c.email_opt_in === false) return false
        if (unsubMap[c.id]) return false
        return true
      })

      setContacts(filtered)
      setLoading(false)
    }

    load()
  }, [step])

  // Extract tags
  const allTags = useMemo(() => {
    const set = new Set<string>()
    contacts.forEach(c => c.tags?.forEach(t => set.add(t)))
    return Array.from(set)
  }, [contacts])

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const name = `${c.first_name} ${c.last_name}`.toLowerCase()
      const email = c.email.toLowerCase()

      const matchesSearch =
        name.includes(search.toLowerCase()) ||
        email.includes(search.toLowerCase())

      const matchesTag =
        !selectedTag || c.tags?.includes(selectedTag)

      return matchesSearch && matchesTag
    })
  }, [contacts, search, selectedTag])

  // Counts
  const selectedContacts = contacts.filter(c => selectedIds.includes(c.id))

  // Handlers
  const toggle = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    )
  }

  const selectAll = () => {
    setSelectedIds(filteredContacts.map(c => c.id))
  }

  const clearAll = () => setSelectedIds([])

  const handleSendTest = async () => {
    setSendingTest(true)
    await fetch('/api/email/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body_html: bodyHtml,
        cta_text: ctaText,
        cta_link: ctaLink,
      }),
    })
    alert('Test email sent')
    setSendingTest(false)
  }

  const handleSend = async () => {
    const res = await fetch('/api/email/broadcast/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body_html: bodyHtml,
        contactIds: selectedIds,
      }),
    })

    const data = await res.json()

    alert(`Sent: ${data.sent}, Skipped: ${data.skipped}, Failed: ${data.failed}`)
    onCloseAction()
  }

  if (!isOpen) return null

  return (
    <div
      onClick={onCloseAction}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#e5e7eb',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* HEADER */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          padding: 16,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <strong>
          {step === 'preview' && 'Preview'}
          {step === 'audience' && 'Select Audience'}
          {step === 'confirm' && 'Confirm Send'}
        </strong>

        <div style={{ display: 'flex', gap: 10 }}>

          {step === 'preview' && (
            <>
              <button onClick={handleSendTest}>
                {sendingTest ? 'Sending...' : 'Send Test'}
              </button>
              <button onClick={() => setStep('audience')}>
                Next
              </button>
            </>
          )}

          {step === 'audience' && (
            <>
              <button onClick={() => setStep('preview')}>Back</button>
              <button onClick={() => setStep('confirm')}>
                Continue ({selectedIds.length})
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <button onClick={() => setStep('audience')}>Back</button>
              <button onClick={handleSend}>
                Send ({selectedIds.length})
              </button>
            </>
          )}

          <button onClick={onCloseAction}>✕</button>

        </div>
      </div>

      {/* BODY */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 40,
        }}
      >
        {step === 'preview' && (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        )}

        {step === 'audience' && (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>

            <input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: 10, marginBottom: 10 }}
            />

            <select
              value={selectedTag || ''}
              onChange={(e) => setSelectedTag(e.target.value || null)}
              style={{ width: '100%', padding: 10, marginBottom: 10 }}
            >
              <option value="">All Tags</option>
              {allTags.map(tag => (
                <option key={tag}>{tag}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <button onClick={selectAll}>Select All</button>
              <button onClick={clearAll}>Clear</button>
            </div>

            {loading && <p>Loading...</p>}

            {!loading && filteredContacts.map(c => (
              <div key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  {c.first_name} {c.last_name} ({c.email})
                </label>
              </div>
            ))}

          </div>
        )}

        {step === 'confirm' && (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <h3>You're about to send to:</h3>
            <p>{selectedContacts.length} contacts</p>
          </div>
        )}

      </div>
    </div>
  )
}
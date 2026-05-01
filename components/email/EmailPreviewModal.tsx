'use client'

import { useEffect, useState } from 'react'
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
}

type View = 'preview' | 'selectContacts'

export default function EmailPreviewModal({
  isOpen,
  onCloseAction,
  html,
  subject,
  bodyHtml,
  ctaText,
  ctaLink,
}: Props) {
  const [view, setView] = useState<View>('preview')
  const [sendingTest, setSendingTest] = useState(false)

  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseAction()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCloseAction])

  useEffect(() => {
    if (view !== 'selectContacts') return

    const loadContacts = async () => {
      setLoadingContacts(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data: membership } = await supabase
        .from('account_users')
        .select('account_id')
        .eq('user_id', user.id)
        .single()

      if (!membership?.account_id) return

      const { data: contactData } = await supabase
        .from('contacts')
        .select(
          'id, email, first_name, last_name, do_not_contact, email_opt_in'
        )
        .eq('account_id', membership.account_id)
        .eq('is_deleted', false)

      const { data: subs } = await supabase
        .from('contact_subscriptions')
        .select('contact_id, unsubscribed')

      const unsubMap: Record<string, boolean> = {}
      subs?.forEach((s) => {
        unsubMap[s.contact_id] = s.unsubscribed
      })

      const filtered = (contactData || []).filter((c) => {
        if (!c.email) return false
        if (c.do_not_contact) return false
        if (c.email_opt_in === false) return false
        if (unsubMap[c.id]) return false
        return true
      })

      setContacts(filtered)
      setLoadingContacts(false)
    }

    loadContacts()
  }, [view])

  if (!isOpen) return null

  const toggleContact = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    )
  }

  const handleSendTest = async () => {
    setSendingTest(true)
    try {
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

      alert('Test email sent!')
    } catch {
      alert('Error sending test')
    } finally {
      setSendingTest(false)
    }
  }

  const handleFinalSend = async () => {
    try {
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

      alert(
        `Sent: ${data.sent}, Skipped: ${data.skipped}, Failed: ${data.failed}`
      )

      onCloseAction()
    } catch {
      alert('Error sending emails')
    }
  }

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
          padding: '12px 20px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 600 }}>
          {view === 'preview' ? 'Email Preview' : 'Select Contacts'}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>

          {view === 'preview' && (
            <>
              <button
                onClick={handleSendTest}
                style={{
                  padding: '8px 14px',
                  background: '#ffffff',
                  border: '1px solid #ccc',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {sendingTest ? 'Sending...' : 'Send Test'}
              </button>

              <button
                onClick={() => setView('selectContacts')}
                style={{
                  padding: '8px 14px',
                  background: '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Send to Contacts
              </button>
            </>
          )}

          {view === 'selectContacts' && (
            <>
              <button
                onClick={() => setView('preview')}
                style={{
                  padding: '8px 14px',
                  background: '#fff',
                  border: '1px solid #ccc',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Back
              </button>

              <button
                onClick={handleFinalSend}
                style={{
                  padding: '8px 14px',
                  background: '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Send Now ({selectedIds.length})
              </button>
            </>
          )}

          <button
            onClick={onCloseAction}
            style={{
              fontSize: 20,
              fontWeight: 'bold',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>

        </div>
      </div>

      {/* SCROLL AREA (FIXED) */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 40,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {view === 'preview' && (
          <div
            style={{
              width: '100%',
              maxWidth: 600,
              background: 'white',
              boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}

        {view === 'selectContacts' && (
          <div style={{ width: 600 }}>
            {contacts.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => toggleContact(c.id)}
                  />
                  {' '}
                  {c.first_name} {c.last_name} ({c.email})
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
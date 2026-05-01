'use client'

import { useEffect, useState } from 'react'

type Props = {
  isOpen: boolean
  onCloseAction: () => void
  html: string
  subject: string
  bodyHtml: string
  ctaText: string | null
  ctaLink: string | null
}

type View = 'preview' | 'selectContacts' | 'schedule'

export default function EmailPreviewModal({
  isOpen,
  onCloseAction,
  html,
  subject,
  bodyHtml,
  ctaText,
  ctaLink,
}: Props) {
  const [sendingTest, setSendingTest] = useState(false)
  const [view, setView] = useState<View>('preview')

  // mock contacts (safe placeholder — we wire real data next)
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const contacts = ['Contact 1', 'Contact 2', 'Contact 3']

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseAction()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCloseAction])

  if (!isOpen) return null

  const handleSendTest = async () => {
    setSendingTest(true)
    try {
      const res = await fetch('/api/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body_html: bodyHtml,
          cta_text: ctaText,
          cta_link: ctaLink,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data.error || 'Failed to send test')
      } else {
        alert('Test email sent!')
      }
    } catch (err) {
      console.error(err)
      alert('Error sending test email')
    } finally {
      setSendingTest(false)
    }
  }

  const toggleContact = (name: string) => {
    setSelectedContacts((prev) =>
      prev.includes(name)
        ? prev.filter((c) => c !== name)
        : [...prev, name]
    )
  }

  const handleFinalSend = () => {
    alert(`Sending to ${selectedContacts.length} contacts (next step: API)`)
  }

  return (
    <div
      onClick={onCloseAction}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#e5e7eb',
        zIndex: 9999,
        overflowY: 'auto',
      }}
    >
      {/* TOP BAR */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'sticky',
          top: 0,
          background: 'white',
          padding: '12px 20px',
          borderBottom: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <div style={{ fontWeight: 600 }}>
          {view === 'preview' && 'Email Preview'}
          {view === 'selectContacts' && 'Select Contacts'}
          {view === 'schedule' && 'Schedule Email'}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {view === 'preview' && (
            <>
              <button onClick={handleSendTest}>
                {sendingTest ? 'Sending...' : 'Send Test'}
              </button>

              <button onClick={() => setView('selectContacts')}>
                Send to Contacts
              </button>

              <button onClick={() => setView('schedule')}>
                Schedule Send
              </button>
            </>
          )}

          {view === 'selectContacts' && (
            <>
              <button onClick={() => setView('preview')}>Back</button>
              <button onClick={handleFinalSend}>
                Send Now ({selectedContacts.length})
              </button>
            </>
          )}

          {view === 'schedule' && (
            <>
              <button onClick={() => setView('preview')}>Back</button>
              <button onClick={() => alert('Schedule logic next')}>
                Schedule Email
              </button>
            </>
          )}

          <button onClick={onCloseAction}>✕</button>
        </div>
      </div>

      {/* CONTENT */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 40 }}
      >
        {view === 'preview' && (
          <div
            style={{
              maxWidth: 600,
              margin: '0 auto',
              background: 'white',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}

        {view === 'selectContacts' && (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            {contacts.map((c) => (
              <div key={c}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedContacts.includes(c)}
                    onChange={() => toggleContact(c)}
                  />
                  {c}
                </label>
              </div>
            ))}
          </div>
        )}

        {view === 'schedule' && (
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <p>Date/time picker coming next</p>
          </div>
        )}
      </div>
    </div>
  )
}
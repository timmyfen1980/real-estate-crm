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

  const handleSendNow = () => {
    alert('Next step: contact selection + broadcast send')
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
        <div style={{ fontWeight: 600 }}>Email Preview</div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleSendTest}
            disabled={sendingTest}
            style={{
              padding: '6px 12px',
              border: '1px solid #ccc',
              borderRadius: 6,
              background: 'white',
              cursor: 'pointer',
            }}
          >
            {sendingTest ? 'Sending...' : 'Send Test'}
          </button>

          <button
            onClick={handleSendNow}
            style={{
              padding: '6px 12px',
              background: 'black',
              color: 'white',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Send Now
          </button>

          <button
            onClick={onCloseAction}
            style={{
              fontSize: 20,
              fontWeight: 'bold',
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              marginLeft: 10,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* EMAIL */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '40px 20px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 600,
            background: 'white',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
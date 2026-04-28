'use client'

import { useState } from 'react'
import EmailPreviewModal from '@/components/email/EmailPreviewModal'

export default function NewCampaignPage() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [ctaEnabled, setCtaEnabled] = useState(false)
  const [ctaText, setCtaText] = useState('')
  const [ctaLink, setCtaLink] = useState('')

  const [previewHtml, setPreviewHtml] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const handlePreview = async () => {
    const res = await fetch('/api/email/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body_html: body,
        cta_text: ctaEnabled ? ctaText : '',
        cta_link: ctaEnabled ? ctaLink : '',
      }),
    })

    const data = await res.json()
    setPreviewHtml(data.html)
    setIsPreviewOpen(true)
  }

  const handleSendTest = async () => {
    const email = prompt('Enter your email to send test:')

    if (!email) return

    await fetch('/api/email/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body_html: body,
        cta_text: ctaEnabled ? ctaText : '',
        cta_link: ctaEnabled ? ctaLink : '',
        test_email: email,
      }),
    })

    alert('Test email sent')
  }

  return (
    <div style={{ padding: '24px', maxWidth: '700px' }}>
      <h1>New Email</h1>

      <input
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        style={inputStyle}
      />

      <textarea
        placeholder="Email Body (HTML allowed)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        style={textareaStyle}
      />

      <div style={{ marginBottom: '16px' }}>
        <label>
          <input
            type="checkbox"
            checked={ctaEnabled}
            onChange={() => setCtaEnabled(!ctaEnabled)}
          />{' '}
          Add Button
        </label>
      </div>

      {ctaEnabled && (
        <>
          <input
            placeholder="CTA Text"
            value={ctaText}
            onChange={(e) => setCtaText(e.target.value)}
            style={inputStyle}
          />

          <input
            placeholder="CTA Link"
            value={ctaLink}
            onChange={(e) => setCtaLink(e.target.value)}
            style={inputStyle}
          />
        </>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
        <button onClick={handlePreview} style={buttonStyle}>
          Preview
        </button>

        <button onClick={handleSendTest} style={buttonStyle}>
          Send Test
        </button>
      </div>

      <EmailPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        html={previewHtml}
      />
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  marginBottom: '12px',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  height: '200px',
  padding: '10px',
  marginBottom: '12px',
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 16px',
  cursor: 'pointer',
}
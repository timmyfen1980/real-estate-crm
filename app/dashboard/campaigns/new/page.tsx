'use client'

import { useState } from 'react'

export default function NewCampaignPage() {
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [ctaLink, setCtaLink] = useState('')
  const [stepNumber, setStepNumber] = useState(1)
  const [delayDays, setDelayDays] = useState(0)

  const [previewHtml, setPreviewHtml] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  const handlePreview = async () => {
    setLoadingPreview(true)

    const res = await fetch('/api/email/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body_html: bodyHtml,
        cta_text: ctaText,
        cta_link: ctaLink,
        step_number: stepNumber,
        delay_days: delayDays,
      }),
    })

    const data = await res.json()
    setPreviewHtml(data.html || '')

    setLoadingPreview(false)
  }

  const handleSendTest = async () => {
    if (!testEmail) {
      alert('Enter a test email')
      return
    }

    setSendingTest(true)

    const res = await fetch('/api/email/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body_html: bodyHtml,
        cta_text: ctaText,
        cta_link: ctaLink,
        step_number: stepNumber,
        delay_days: delayDays,
        test_email: testEmail,
      }),
    })

    const data = await res.json()

    if (data.success) {
      alert('Test email sent')
    } else {
      alert('Failed to send email')
    }

    setSendingTest(false)
  }

  return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* LEFT SIDE — FORM */}
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">New Email Step</h1>

        <input
          className="w-full border p-2"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <textarea
          className="w-full border p-2 h-40"
          placeholder="Email Body (HTML allowed)"
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
        />

        <input
          className="w-full border p-2"
          placeholder="CTA Text"
          value={ctaText}
          onChange={(e) => setCtaText(e.target.value)}
        />

        <input
          className="w-full border p-2"
          placeholder="CTA Link"
          value={ctaLink}
          onChange={(e) => setCtaLink(e.target.value)}
        />

        <input
          type="number"
          className="w-full border p-2"
          placeholder="Step Number"
          value={stepNumber}
          onChange={(e) => setStepNumber(Number(e.target.value))}
        />

        <input
          type="number"
          className="w-full border p-2"
          placeholder="Delay Days"
          value={delayDays}
          onChange={(e) => setDelayDays(Number(e.target.value))}
        />

        <button
          onClick={handlePreview}
          className="bg-blue-600 text-white px-4 py-2"
        >
          {loadingPreview ? 'Loading...' : 'Preview'}
        </button>

        <div className="pt-4 border-t">
          <input
            className="w-full border p-2 mb-2"
            placeholder="Send test to email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />

          <button
            onClick={handleSendTest}
            className="bg-green-600 text-white px-4 py-2"
          >
            {sendingTest ? 'Sending...' : 'Send Test'}
          </button>
        </div>
      </div>

      {/* RIGHT SIDE — PREVIEW */}
      <div className="border h-[700px]">
        {previewHtml ? (
          <iframe
            srcDoc={previewHtml}
            className="w-full h-full"
          />
        ) : (
          <div className="p-4 text-gray-500">
            No preview yet
          </div>
        )}
      </div>
    </div>
  )
}
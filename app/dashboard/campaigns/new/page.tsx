'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import EmailPreviewModal from '@/components/email/EmailPreviewModal'
import { buildEmailTemplate } from '@/lib/emailTemplates'

export default function NewCampaignPage() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [ctaEnabled, setCtaEnabled] = useState(false)
  const [ctaText, setCtaText] = useState('')
  const [ctaLink, setCtaLink] = useState('')

  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  const [agent, setAgent] = useState<any>(null)
  const [account, setAccount] = useState<any>(null)

  // 🔥 LOAD REAL USER + ACCOUNT
  useEffect(() => {
    const loadData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      // profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      // account link
      const { data: membership } = await supabase
        .from('account_users')
        .select('account_id')
        .eq('user_id', user.id)
        .single()

      let acct = null

      if (membership?.account_id) {
        const { data: accountData } = await supabase
          .from('accounts')
          .select('*')
          .eq('id', membership.account_id)
          .single()

        acct = accountData
      }

      setAgent(profile)
      setAccount(acct)
    }

    loadData()
  }, [])

  const handlePreview = () => {
    if (!agent || !account) {
      alert('Loading profile data...')
      return
    }

    const html = buildEmailTemplate({
      content: body,
      firstName: 'John',
      agentName: agent.full_name || '',
      agentEmail: agent.email || '',
      agentPhone: agent.phone || '',
      agentPhoto: agent.agent_photo_url || '',
      teamLogo: account.team_logo_url || '',
      brokerageLogo: account.brokerage_logo_url || '',
      brokerageName: account.brokerage_name || '',
      unsubscribeLink: `${process.env.NEXT_PUBLIC_SITE_URL}/api/unsubscribe?contact_id=test`,
      ctaLink: ctaEnabled ? ctaLink : '',
      ctaText: ctaEnabled ? ctaText : '',
      emailHeaderImage: account.email_header_image_url || '',
    })

    setPreviewHtml(html)
    setShowPreview(true)
  }

  const handleSendTest = async () => {
    await fetch('/api/email/send-test', {
      method: 'POST',
      body: JSON.stringify({
        subject,
        body_html: body,
        cta_text: ctaEnabled ? ctaText : null,
        cta_link: ctaEnabled ? ctaLink : null,
      }),
    })

    alert('Test email sent')
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 20 }}>
      <h1 style={{ fontSize: 24, marginBottom: 10 }}>Create Email</h1>
      <p style={{ marginBottom: 30, color: '#666' }}>
        Design and preview your email before sending
      </p>

      {/* SUBJECT */}
      <div style={{ marginBottom: 20 }}>
        <label>Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{
            width: '100%',
            padding: 10,
            marginTop: 5,
            border: '1px solid #ccc',
            borderRadius: 6,
          }}
        />
      </div>

      {/* BODY */}
      <div style={{ marginBottom: 20 }}>
        <label>Email Content</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{
            width: '100%',
            height: 200,
            padding: 10,
            marginTop: 5,
            border: '1px solid #ccc',
            borderRadius: 6,
          }}
        />
      </div>

      {/* CTA */}
      <div style={{ marginBottom: 20 }}>
        <label>
          <input
            type="checkbox"
            checked={ctaEnabled}
            onChange={() => setCtaEnabled(!ctaEnabled)}
          />{' '}
          Include Button
        </label>

        {ctaEnabled && (
          <div style={{ marginTop: 10 }}>
            <input
              placeholder="Button Text"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                marginBottom: 10,
                border: '1px solid #ccc',
                borderRadius: 6,
              }}
            />
            <input
              placeholder="Button Link"
              value={ctaLink}
              onChange={(e) => setCtaLink(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid #ccc',
                borderRadius: 6,
              }}
            />
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handlePreview}
          style={{
            padding: '10px 20px',
            background: 'black',
            color: 'white',
            borderRadius: 6,
          }}
        >
          Preview Email
        </button>

        <button
          onClick={handleSendTest}
          style={{
            padding: '10px 20px',
            border: '1px solid #ccc',
            borderRadius: 6,
          }}
        >
          Send Test
        </button>
      </div>

      <EmailPreviewModal
  isOpen={showPreview}
  onCloseAction={() => setShowPreview(false)}
  html={previewHtml}
/>
    </div>
  )
}
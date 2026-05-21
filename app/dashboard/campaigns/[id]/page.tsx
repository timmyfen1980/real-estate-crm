'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import EmailPreviewModal from '@/components/email/EmailPreviewModal'
import { buildEmailTemplate } from '@/lib/emailTemplates'

type Campaign = {
  id: string
  name: string
  type: string | null
  audience: string | null
  is_active: boolean
  created_at: string
}

type Sequence = {
  id: string
  campaign_id: string
  step_number: number
  subject: string
  body_html: string
  delay_days: number
  cta_text: string | null
  cta_link: string | null
  created_at: string
}
type CampaignContact = {
  id: string
  contact_id: string
  current_step: number
  next_send_at: string | null
  status: string

  contacts: {
    first_name: string | null
    last_name: string | null
    email: string | null
    lifecycle_stage: string | null
  } | null
}

type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  lifecycle_stage: string | null
  assigned_user_id: string | null
}

export default function CampaignDetailPage() {
  const params = useParams()

  const campaignId = params.id as string

  const [loading, setLoading] = useState(true)

  const [campaign, setCampaign] = useState<Campaign | null>(null)

  const [sequences, setSequences] = useState<Sequence[]>([])

  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null)

  const [saving, setSaving] = useState(false)
    const [previewOpen, setPreviewOpen] = useState(false)

  const [previewHtml, setPreviewHtml] = useState('')

  const [previewSubject, setPreviewSubject] = useState('')

  const [agent, setAgent] = useState<any>(null)

  const [account, setAccount] = useState<any>(null)
  const [campaignContacts, setCampaignContacts] = useState<CampaignContact[]>([])

  const [showEnrollModal, setShowEnrollModal] = useState(false)

const [availableContacts, setAvailableContacts] = useState<Contact[]>([])

const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])

const [contactSearch, setContactSearch] = useState('')

const [enrolling, setEnrolling] = useState(false)
  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const { data: campaignData } = await supabase
        .from('email_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single()

      const { data: sequenceData } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('step_number', { ascending: true })

      setCampaign(campaignData || null)
      setSequences(sequenceData || [])
      const { data: campaignContactsData } = await supabase
  .from('contact_campaigns')
  .select(`
    id,
    contact_id,
    current_step,
    next_send_at,
    status,
    contacts (
      first_name,
      last_name,
      email,
      lifecycle_stage
    )
  `)
  .eq('campaign_id', campaignId)
  .order('next_send_at', { ascending: true })

setCampaignContacts(
  ((campaignContactsData || []) as unknown as CampaignContact[])
)
const enrolledIds =
  (campaignContactsData || []).map(
    (item: any) => item.contact_id
  )

const { data: availableContactsData } = await supabase
  .from('contacts')
  .select(`
    id,
    first_name,
    last_name,
    email,
    lifecycle_stage,
    assigned_user_id
  `)
  .eq('is_deleted', false)
  .eq('email_opt_in', true)

const filteredAvailable =
  (availableContactsData || []).filter(
    (contact: any) =>
      !enrolledIds.includes(contact.id)
  )

setAvailableContacts(filteredAvailable)
            const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        const { data: membership } = await supabase
          .from('account_users')
          .select('account_id')
          .eq('user_id', user.id)
          .single()

        let accountData = null

        if (membership?.account_id) {
          const { data } = await supabase
            .from('accounts')
            .select('*')
            .eq('id', membership.account_id)
            .single()

          accountData = data
        }

        setAgent(profile)
        setAccount(accountData)
      }
      setLoading(false)
    }

    if (campaignId) {
      load()
    }
  }, [campaignId])

const handleSave = async () => {
  if (!editingSequence) return

  setSaving(true)

  const isNew =
    editingSequence.id.startsWith('new-')

  if (isNew) {
    const { data, error } = await supabase
      .from('email_sequences')
      .insert([
        {
          campaign_id: campaignId,
          step_number: editingSequence.step_number,
          subject: editingSequence.subject,
          body_html: editingSequence.body_html,
          delay_days: editingSequence.delay_days,
          cta_text: editingSequence.cta_text,
          cta_link: editingSequence.cta_link,
        },
      ])
      .select()
      .single()

    if (!error && data) {
      setSequences((prev) => [
        ...prev,
        data,
      ])

      setEditingSequence(null)
    }
  } else {
    const { error } = await supabase
      .from('email_sequences')
      .update({
        subject: editingSequence.subject,
        body_html: editingSequence.body_html,
        delay_days: editingSequence.delay_days,
        cta_text: editingSequence.cta_text,
        cta_link: editingSequence.cta_link,
      })
      .eq('id', editingSequence.id)

    if (!error) {
      setSequences((prev) =>
        prev.map((seq) =>
          seq.id === editingSequence.id
            ? editingSequence
            : seq
        )
      )

      setEditingSequence(null)
    }
  }

  setSaving(false)
}
const handleEnrollContacts = async () => {
  if (selectedContactIds.length === 0) return

  setEnrolling(true)

  const rows = selectedContactIds.map((contactId) => ({
    contact_id: contactId,
    campaign_id: campaignId,
    status: 'active',
    current_step: 1,
    next_send_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('contact_campaigns')
    .insert(rows)

  if (!error) {
    window.location.reload()
  }

  setEnrolling(false)
}
const handlePauseContact = async (id: string) => {
  await supabase
    .from('contact_campaigns')
    .update({
      status: 'paused',
    })
    .eq('id', id)

  setCampaignContacts((prev) =>
    prev.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'paused',
          }
        : item
    )
  )
}

const handleResumeContact = async (id: string) => {
  await supabase
    .from('contact_campaigns')
    .update({
      status: 'active',
    })
    .eq('id', id)

  setCampaignContacts((prev) =>
    prev.map((item) =>
      item.id === id
        ? {
            ...item,
            status: 'active',
          }
        : item
    )
  )
}

const handleRemoveContact = async (id: string) => {
  await supabase
    .from('contact_campaigns')
    .delete()
    .eq('id', id)

  setCampaignContacts((prev) =>
    prev.filter((item) => item.id !== id)
  )
}
const handlePreview = (sequence: Sequence) => {
  if (!agent || !account) return

  const html = buildEmailTemplate({
    content: sequence.body_html,
    firstName: 'John',
    agentName: agent.full_name || '',
    agentEmail: agent.email || '',
    agentPhone: agent.phone || '',
    agentPhoto: agent.agent_photo_url || '',
    teamLogo: account.team_logo_url || '',
    brokerageLogo: account.brokerage_logo_url || '',
    brokerageName: account.brokerage_name || '',
    unsubscribeLink: `${process.env.NEXT_PUBLIC_SITE_URL}/api/unsubscribe?contact_id=test`,
    ctaLink: sequence.cta_link || '',
    ctaText: sequence.cta_text || '',
    emailHeaderImage: account.email_header_image_url || '',
  })

  setPreviewHtml(html)
  setPreviewSubject(sequence.subject)
  setPreviewOpen(true)
}
  if (loading) {
    return (
      <div className="text-center py-20 text-gray-500">
        Loading campaign...
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="text-center py-20">

        <h1 className="text-2xl font-bold mb-4">
          Campaign Not Found
        </h1>

        <Link
          href="/dashboard/campaigns"
          className="text-blue-600 hover:underline"
        >
          Back to Campaigns
        </Link>

      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">

      {/* HEADER */}
      <div className="mb-10">

        <Link
          href="/dashboard/campaigns"
          className="text-sm text-gray-500 hover:text-black transition"
        >
          ← Back to Campaigns
        </Link>

        <div className="flex items-center justify-between mt-4">

  <div>

    <h1 className="text-4xl font-bold text-gray-900">
      {campaign.name}
    </h1>

  </div>

  <button
    onClick={() => {
      const nextStep =
        sequences.length + 1

      const newSequence: Sequence = {
        id: `new-${Date.now()}`,
        campaign_id: campaignId,
        step_number: nextStep,
        subject: '',
        body_html: '',
        delay_days: 0,
        cta_text: '',
        cta_link: '',
        created_at: new Date().toISOString(),
      }

      setEditingSequence(newSequence)
    }}
    className="bg-black text-white px-5 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition"
  >
    Add Email
  </button>

</div>

      </div>

      {/* EMAILS */}
      <div className="space-y-6">

        {sequences.map((sequence, index) => (
          <div
            key={sequence.id}
            className="relative"
          >

            {index !== sequences.length - 1 && (
              <div
                className="absolute left-[31px] top-[76px] w-[2px] bg-gray-200"
                style={{ height: 'calc(100% + 24px)' }}
              />
            )}

            <div className="flex gap-6">

              {/* DAY */}
              <div className="relative z-10">

                <div className="h-16 w-16 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm shadow-sm text-center leading-tight">
                  Day
                  <br />
                  {sequence.delay_days}
                </div>

              </div>

              {/* CARD */}
              <div className="flex-1 bg-white border rounded-2xl shadow-sm overflow-hidden">

                <div className="px-8 py-7">

                  <div className="flex items-start justify-between gap-4 mb-5">

                    <div>

                      <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">
                        Email {sequence.step_number}
                      </div>

                      <h2 className="text-2xl font-semibold text-gray-900 leading-tight">
                        {sequence.subject}
                      </h2>

                    </div>

                   <div className="flex items-center gap-3">

  <button
    onClick={() => handlePreview(sequence)}
    className="border px-4 py-2 rounded-xl text-sm hover:bg-gray-100 transition"
  >
    Preview
  </button>

  <button
    onClick={() => setEditingSequence(sequence)}
    className="bg-black text-white px-4 py-2 rounded-xl text-sm hover:opacity-90 transition"
  >
    Edit Email
  </button>

</div>

                  </div>

                  <div
                    className="text-gray-600 leading-7 text-[15px]"
                    dangerouslySetInnerHTML={{
                      __html:
                        sequence.body_html.length > 280
                          ? `${sequence.body_html.substring(0, 280)}...`
                          : sequence.body_html,
                    }}
                  />

                </div>

              </div>

            </div>

          </div>
        ))}
{/* ACTIVE CONTACTS */}
<div className="mt-16">

  <div className="flex items-center justify-between mb-6">

    <div>

      <h2 className="text-2xl font-bold text-gray-900">
        Active Campaign Contacts
      </h2>

      <p className="text-gray-500 mt-1">
        Contacts currently enrolled in this automation
      </p>

    </div>

    <div className="inline-flex items-center rounded-full bg-black text-white px-4 py-2 text-sm font-medium">
      {campaignContacts.length} Active
    </div>

  </div>

  <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">

    {campaignContacts.length === 0 ? (
      <div className="p-10 text-center text-gray-500">
        No contacts enrolled in this campaign yet.
      </div>
    ) : (
      <table className="w-full">

        <thead className="bg-gray-50 border-b text-sm text-gray-500">
          <tr>

            <th className="text-left px-6 py-4 font-medium">
              Contact
            </th>

            <th className="text-left px-6 py-4 font-medium">
              Lifecycle
            </th>

            <th className="text-left px-6 py-4 font-medium">
              Current Step
            </th>

            <th className="text-left px-6 py-4 font-medium">
              Next Send
            </th>

            <th className="text-left px-6 py-4 font-medium">
              Status
            </th>
            <th className="text-right px-6 py-4 font-medium">
  Actions
</th>

          </tr>
        </thead>

        <tbody>

      {campaignContacts.map((item) => (

  <tr
    key={item.id}
    className="border-b last:border-b-0"
  >

    <td className="px-6 py-5">

      <div className="font-semibold text-gray-900">
        {item.contacts?.first_name} {item.contacts?.last_name}
      </div>

      <div className="text-sm text-gray-500 mt-1">
        {item.contacts?.email}
      </div>

    </td>

    <td className="px-6 py-5 text-sm text-gray-700">
      {item.contacts?.lifecycle_stage || '—'}
    </td>

    <td className="px-6 py-5">
      <div className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-sm font-medium">
        Email {item.current_step}
      </div>
    </td>

    <td className="px-6 py-5 text-sm text-gray-700">

      {item.next_send_at
        ? new Date(item.next_send_at).toLocaleDateString()
        : 'Completed'}

    </td>

    <td className="px-6 py-5">

      {item.status === 'active' ? (
        <div className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-3 py-1 text-sm font-medium">
          Active
        </div>
      ) : item.status === 'paused' ? (
        <div className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-700 px-3 py-1 text-sm font-medium">
          Paused
        </div>
      ) : (
        <div className="inline-flex items-center rounded-full bg-gray-200 text-gray-700 px-3 py-1 text-sm font-medium">
          {item.status}
        </div>
      )}

    </td>

    <td className="px-6 py-5">

      <div className="flex items-center justify-end gap-2">

        {item.status === 'active' ? (
          <button
            onClick={() => handlePauseContact(item.id)}
            className="border px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition"
          >
            Pause
          </button>
        ) : (
          <button
            onClick={() => handleResumeContact(item.id)}
            className="border px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition"
          >
            Resume
          </button>
        )}

        <button
          onClick={() => handleRemoveContact(item.id)}
          className="border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm hover:bg-red-50 transition"
        >
          Remove
        </button>

      </div>

    </td>

  </tr>

))}
        </tbody>

      </table>
    )}

  </div>

</div>
      </div>

      {/* EDIT MODAL */}
      {editingSequence && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">

          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">

            <div className="p-8 border-b">

              <div className="flex items-center justify-between">

                <h2 className="text-2xl font-bold">
                  Edit Campaign Email
                </h2>

                <button
                  onClick={() => setEditingSequence(null)}
                  className="text-2xl text-gray-400 hover:text-black"
                >
                  ×
                </button>

              </div>

            </div>

            <div className="p-8 space-y-6">

              <div>

                <label className="block text-sm font-medium mb-2">
                  Subject Line
                </label>

                <input
                  value={editingSequence.subject}
                  onChange={(e) =>
                    setEditingSequence({
                      ...editingSequence,
                      subject: e.target.value,
                    })
                  }
                  className="w-full border rounded-xl px-4 py-3"
                />

              </div>

              <div>

                <label className="block text-sm font-medium mb-2">
                  Delay Before Sending (Days)
                </label>

                <input
                  type="number"
                  value={editingSequence.delay_days}
                  onChange={(e) =>
                    setEditingSequence({
                      ...editingSequence,
                      delay_days: Number(e.target.value),
                    })
                  }
                  className="w-40 border rounded-xl px-4 py-3"
                />

              </div>

              <div className="space-y-4">

  <div className="flex items-center justify-between">

    <label className="block text-sm font-medium">
      Email Content
    </label>

    <div className="flex items-center gap-2 flex-wrap">

      <button
        type="button"
        onClick={() =>
          setEditingSequence({
            ...editingSequence,
            body_html:
              `${editingSequence.body_html} {{first_name}}`,
          })
        }
        className="text-xs border rounded-full px-3 py-1 hover:bg-gray-100 transition"
      >
        + First Name
      </button>

      <button
        type="button"
        onClick={() =>
          setEditingSequence({
            ...editingSequence,
            body_html:
              `${editingSequence.body_html}\n\n<p><strong>Market Insight:</strong></p>`,
          })
        }
        className="text-xs border rounded-full px-3 py-1 hover:bg-gray-100 transition"
      >
        + Market Section
      </button>

      <button
        type="button"
        onClick={() =>
          setEditingSequence({
            ...editingSequence,
            body_html:
              `${editingSequence.body_html}\n\n<p>Let me know if you'd like to schedule a quick call.</p>`,
          })
        }
        className="text-xs border rounded-full px-3 py-1 hover:bg-gray-100 transition"
      >
        + Consultation CTA
      </button>

    </div>

  </div>

  <div className="rounded-2xl border bg-gray-50 p-4 text-sm text-gray-600 leading-7">

    <div className="font-semibold text-gray-900 mb-2">
      Writing Guidelines
    </div>

    <ul className="space-y-1 list-disc pl-5">
      <li>Keep emails conversational and relationship-focused</li>
      <li>Avoid overly aggressive sales language</li>
      <li>Use short paragraphs for mobile readability</li>
      <li>Encourage replies and conversations</li>
      <li>Educational emails perform best</li>
    </ul>

  </div>

  <textarea
    value={editingSequence.body_html}
    onChange={(e) =>
      setEditingSequence({
        ...editingSequence,
        body_html: e.target.value,
      })
    }
    className="w-full border rounded-2xl px-5 py-5 min-h-[350px] leading-7"
  />

</div>
<div className="rounded-2xl border bg-blue-50 p-5">

  <div className="font-semibold text-blue-900 mb-2">
    CTA Best Practices
  </div>

  <div className="text-sm text-blue-800 leading-7">
    Use one clear action per email.
    Examples:
    book a consultation,
    request a valuation,
    browse listings,
    or reply directly to the agent.
  </div>

</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div>

                  <label className="block text-sm font-medium mb-2">
                    CTA Button Text
                  </label>

                  <input
                    value={editingSequence.cta_text || ''}
                    onChange={(e) =>
                      setEditingSequence({
                        ...editingSequence,
                        cta_text: e.target.value,
                      })
                    }
                    className="w-full border rounded-xl px-4 py-3"
                  />

                </div>

                <div>

                  <label className="block text-sm font-medium mb-2">
                    CTA Link
                  </label>

                  <input
                    value={editingSequence.cta_link || ''}
                    onChange={(e) =>
                      setEditingSequence({
                        ...editingSequence,
                        cta_link: e.target.value,
                      })
                    }
                    className="w-full border rounded-xl px-4 py-3"
                  />

                </div>

              </div>

            </div>

            <div className="p-8 border-t flex items-center justify-end gap-4">

              <button
                onClick={() => setEditingSequence(null)}
                className="border px-6 py-3 rounded-xl hover:bg-gray-100 transition"
              >
                Cancel
              </button>

              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-black text-white px-6 py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>

            </div>

          </div>

        </div>
      )}

         {/* ENROLL CONTACTS MODAL */}
{showEnrollModal && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">

    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">

      <div className="p-8 border-b flex items-center justify-between">

        <div>

          <h2 className="text-2xl font-bold">
            Add Contacts To Campaign
          </h2>

          <p className="text-gray-500 mt-1">
            Enroll contacts into this automation workflow
          </p>

        </div>

        <button
          onClick={() => setShowEnrollModal(false)}
          className="text-2xl text-gray-400 hover:text-black"
        >
          ×
        </button>

      </div>

      <div className="p-8 border-b">

        <input
          placeholder="Search contacts..."
          value={contactSearch}
          onChange={(e) => setContactSearch(e.target.value)}
          className="w-full border rounded-2xl px-5 py-4"
        />

      </div>

      <div className="flex-1 overflow-y-auto">

        {availableContacts
          .filter((contact) => {
            const full =
              `${contact.first_name || ''} ${contact.last_name || ''} ${contact.email || ''}`.toLowerCase()

            return full.includes(contactSearch.toLowerCase())
          })
          .map((contact) => {

            const selected =
              selectedContactIds.includes(contact.id)

            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => {
                  if (selected) {
                    setSelectedContactIds((prev) =>
                      prev.filter((id) => id !== contact.id)
                    )
                  } else {
                    setSelectedContactIds((prev) => [
                      ...prev,
                      contact.id,
                    ])
                  }
                }}
                className={`w-full text-left px-8 py-5 border-b hover:bg-gray-50 transition ${
                  selected ? 'bg-blue-50' : ''
                }`}
              >

                <div className="flex items-center justify-between">

                  <div>

                    <div className="font-semibold text-gray-900">
                      {contact.first_name} {contact.last_name}
                    </div>

                    <div className="text-sm text-gray-500 mt-1">
                      {contact.email}
                    </div>

                  </div>

                  <div className="flex items-center gap-3">

                    <div className="text-sm text-gray-500">
                      {contact.lifecycle_stage || '—'}
                    </div>

                    {selected && (
                      <div className="h-5 w-5 rounded-full bg-black text-white flex items-center justify-center text-xs">
                        ✓
                      </div>
                    )}

                  </div>

                </div>

              </button>
            )
          })}

      </div>

      <div className="p-8 border-t flex items-center justify-between">

        <div className="text-sm text-gray-500">
          {selectedContactIds.length} selected
        </div>

        <div className="flex items-center gap-4">

          <button
            onClick={() => setShowEnrollModal(false)}
            className="border px-6 py-3 rounded-xl hover:bg-gray-100 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleEnrollContacts}
            disabled={enrolling}
            className="bg-black text-white px-6 py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
          >
            {enrolling
              ? 'Adding Contacts...'
              : 'Add To Campaign'}
          </button>

        </div>

      </div>

    </div>

  </div>
)}

<EmailPreviewModal
  isOpen={previewOpen}
  onCloseAction={() => setPreviewOpen(false)}
  html={previewHtml}
  subject={previewSubject}
  bodyHtml={previewHtml}
  ctaText={null}
  ctaLink={null}
/>

    </div>
  )
}
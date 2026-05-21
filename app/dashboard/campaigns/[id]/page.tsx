'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

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

export default function CampaignDetailPage() {
  const params = useParams()

  const campaignId = params.id as string

  const [loading, setLoading] = useState(true)

  const [campaign, setCampaign] = useState<Campaign | null>(null)

  const [sequences, setSequences] = useState<Sequence[]>([])

  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null)

  const [saving, setSaving] = useState(false)

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

      setLoading(false)
    }

    if (campaignId) {
      load()
    }
  }, [campaignId])

  const handleSave = async () => {
    if (!editingSequence) return

    setSaving(true)

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
          seq.id === editingSequence.id ? editingSequence : seq
        )
      )

      setEditingSequence(null)
    }

    setSaving(false)
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

            <div className="flex items-center gap-3 mt-4">

              <div className="text-sm text-gray-500">
                {campaign.audience || 'General Audience'}
              </div>

              <div className="h-1 w-1 rounded-full bg-gray-300" />

              <div className="text-sm text-gray-500">
                {sequences.length} Email{sequences.length !== 1 ? 's' : ''}
              </div>

            </div>

          </div>

          {campaign.is_active ? (
            <div className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-4 py-2 text-sm font-medium">
              Active
            </div>
          ) : (
            <div className="inline-flex items-center rounded-full bg-gray-200 text-gray-700 px-4 py-2 text-sm font-medium">
              Inactive
            </div>
          )}

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

                    <button
                      onClick={() => setEditingSequence(sequence)}
                      className="border px-4 py-2 rounded-xl text-sm hover:bg-gray-100 transition"
                    >
                      Edit Email
                    </button>

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

              <div>

                <label className="block text-sm font-medium mb-2">
                  Email Content
                </label>

                <textarea
                  value={editingSequence.body_html}
                  onChange={(e) =>
                    setEditingSequence({
                      ...editingSequence,
                      body_html: e.target.value,
                    })
                  }
                  className="w-full border rounded-xl px-4 py-4 min-h-[300px]"
                />

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

    </div>
  )
}
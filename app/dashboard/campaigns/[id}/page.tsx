'use client'

import { useEffect, useMemo, useState } from 'react'
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
  created_at: string
}

export default function CampaignDetailPage() {
  const params = useParams()

  const campaignId = params.id as string

  const [loading, setLoading] = useState(true)

  const [campaign, setCampaign] = useState<Campaign | null>(null)

  const [sequences, setSequences] = useState<Sequence[]>([])

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

  const totalTimelineDays = useMemo(() => {
    return sequences.reduce(
      (sum, seq) => sum + (seq.delay_days || 0),
      0
    )
  }, [sequences])

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
    <div className="space-y-8">

      {/* TOP BAR */}
      <div className="flex items-start justify-between gap-4">

        <div>

          <Link
            href="/dashboard/campaigns"
            className="text-sm text-gray-500 hover:text-black transition"
          >
            ← Back to Campaigns
          </Link>

          <h1 className="text-3xl font-bold text-gray-900 mt-3">
            {campaign.name}
          </h1>

          <p className="text-gray-500 mt-2">
            Relationship-focused automated nurture campaign
          </p>

        </div>

        <div className="flex items-center gap-3">

          {campaign.is_active ? (
            <div className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-4 py-2 text-sm font-medium">
              Active Campaign
            </div>
          ) : (
            <div className="inline-flex items-center rounded-full bg-gray-200 text-gray-700 px-4 py-2 text-sm font-medium">
              Inactive Campaign
            </div>
          )}

        </div>

      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <div className="text-sm text-gray-500 mb-2">
            Audience
          </div>

          <div className="text-lg font-semibold text-gray-900">
            {campaign.audience || 'General'}
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <div className="text-sm text-gray-500 mb-2">
            Campaign Type
          </div>

          <div className="text-lg font-semibold text-gray-900">
            {campaign.type || 'Automation'}
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <div className="text-sm text-gray-500 mb-2">
            Total Emails
          </div>

          <div className="text-3xl font-bold text-blue-600">
            {sequences.length}
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <div className="text-sm text-gray-500 mb-2">
            Timeline Length
          </div>

          <div className="text-3xl font-bold text-purple-600">
            {totalTimelineDays}d
          </div>
        </div>

      </div>

      {/* TIMELINE */}
      <div className="space-y-6">

        {sequences.map((sequence, index) => (
          <div
            key={sequence.id}
            className="relative"
          >

            {/* CONNECTOR */}
            {index !== sequences.length - 1 && (
              <div
                className="absolute left-[31px] top-[76px] w-[2px] bg-gray-200"
                style={{ height: 'calc(100% + 24px)' }}
              />
            )}

            <div className="flex gap-6">

              {/* STEP DOT */}
              <div className="relative z-10">

                <div className="h-16 w-16 rounded-full bg-black text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  {sequence.step_number}
                </div>

              </div>

              {/* CARD */}
              <div className="flex-1 bg-white border rounded-2xl shadow-sm overflow-hidden">

                <div className="border-b px-6 py-5 bg-gray-50">

                  <div className="flex items-start justify-between gap-4">

                    <div>

                      <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
                        Email Step {sequence.step_number}
                      </div>

                      <h2 className="text-xl font-semibold text-gray-900">
                        {sequence.subject}
                      </h2>

                    </div>

                    <div className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-sm font-medium whitespace-nowrap">
                      +{sequence.delay_days} Day{sequence.delay_days !== 1 ? 's' : ''}
                    </div>

                  </div>

                </div>

                <div className="p-6">

                  <div className="text-sm text-gray-500 mb-3">
                    Email Preview
                  </div>

                  <div
                    className="text-gray-700 leading-7"
                    dangerouslySetInnerHTML={{
                      __html:
                        sequence.body_html.length > 400
                          ? `${sequence.body_html.substring(0, 400)}...`
                          : sequence.body_html,
                    }}
                  />

                </div>

                <div className="border-t px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">

                  <button
                    className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-100 transition"
                  >
                    Preview Email
                  </button>

                  <button
                    className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-100 transition"
                  >
                    Edit Step
                  </button>

                </div>

              </div>

            </div>

          </div>
        ))}

      </div>

    </div>
  )
}
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Campaign = {
  id: string
  account_id: string
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
  delay_days: number
}

type CampaignWithMeta = Campaign & {
  sequenceCount: number
  totalDelay: number
}

export default function CampaignsPage() {
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [accountId, setAccountId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      const { data: membership } = await supabase
        .from('account_users')
        .select('account_id')
        .eq('user_id', user.id)
        .single()

      if (!membership?.account_id) {
        setLoading(false)
        return
      }

      setAccountId(membership.account_id)

      const { data: campaignsData } = await supabase
        .from('email_campaigns')
        .select('*')
        .eq('account_id', membership.account_id)
        .order('created_at', { ascending: false })

      const { data: sequenceData } = await supabase
        .from('email_sequences')
        .select('id, campaign_id, step_number, delay_days')

      setCampaigns(campaignsData || [])
      setSequences(sequenceData || [])
      setLoading(false)
    }

    load()
  }, [])

  const campaignRows = useMemo<CampaignWithMeta[]>(() => {
    return campaigns.map((campaign) => {
      const relatedSequences = sequences.filter(
        (s) => s.campaign_id === campaign.id
      )

      const totalDelay = relatedSequences.reduce(
        (sum, seq) => sum + (seq.delay_days || 0),
        0
      )

      return {
        ...campaign,
        sequenceCount: relatedSequences.length,
        totalDelay,
      }
    })
  }, [campaigns, sequences])

  const activeCount = campaignRows.filter((c) => c.is_active).length

  return (
    <div className="space-y-6">
<div className="text-center mb-10">

  <h1 className="text-4xl font-bold text-gray-900 mb-4">
    Email Campaigns
  </h1>

  <p className="text-gray-500 text-lg mb-8">
    Manage automated nurture campaigns and send branded mass emails.
  </p>

  <Link
    href="/dashboard/campaigns/new"
    className="inline-flex items-center justify-center bg-black text-white px-10 py-5 rounded-2xl text-lg font-semibold hover:opacity-90 transition shadow-sm"
  >
    Create Mass Email
  </Link>

</div>

      
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">


        {loading ? (
          <div className="p-10 text-center text-gray-500">
            Loading campaigns...
          </div>
        ) : campaignRows.length === 0 ? (
          <div className="p-10 text-center">

            <div className="text-lg font-semibold text-gray-900 mb-2">
              No campaigns found
            </div>

            <p className="text-gray-500 mb-6">
              Your automated nurture campaigns will appear here.
            </p>

            <Link
              href="/dashboard/campaigns/new"
              className="inline-flex items-center bg-black text-white px-5 py-3 rounded-xl text-sm font-medium"
            >
              Create Email
            </Link>

          </div>
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full">

              <thead className="bg-gray-50 border-b text-sm text-gray-500">
                <tr>
                  <th className="text-left px-6 py-4 font-medium">
                    Campaign
                  </th>

                  <th className="text-left px-6 py-4 font-medium">
                    Audience
                  </th>

                  <th className="text-left px-6 py-4 font-medium">
                    Emails
                  </th>

                  <th className="text-left px-6 py-4 font-medium">
                    Sequence Timing
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

                {campaignRows.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className="border-b last:border-b-0 hover:bg-gray-50 transition"
                  >

                    <td className="px-6 py-5 align-top">

                      <div className="font-semibold text-gray-900">
                        {campaign.name}
                      </div>

                      <div className="text-sm text-gray-500 mt-1">
                        {campaign.type || 'Campaign'}
                      </div>

                    </td>

                    <td className="px-6 py-5 align-top">
                      <div className="text-sm text-gray-700">
                        {campaign.audience || 'General Audience'}
                      </div>
                    </td>

                    <td className="px-6 py-5 align-top">
                      <div className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-sm font-medium">
                        {campaign.sequenceCount} Email{campaign.sequenceCount !== 1 ? 's' : ''}
                      </div>
                    </td>

                    <td className="px-6 py-5 align-top">
                      <div className="text-sm text-gray-700">
                        {campaign.totalDelay} Total Day{campaign.totalDelay !== 1 ? 's' : ''}
                      </div>
                    </td>

                    <td className="px-6 py-5 align-top">

                      {campaign.is_active ? (
                        <div className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-3 py-1 text-sm font-medium">
                          Active
                        </div>
                      ) : (
                        <div className="inline-flex items-center rounded-full bg-gray-200 text-gray-700 px-3 py-1 text-sm font-medium">
                          Inactive
                        </div>
                      )}

                    </td>

                    <td className="px-6 py-5 align-top">

                      <div className="flex items-center justify-end gap-2 flex-wrap">

                        <Link
  href={`/dashboard/campaigns/${campaign.id}`}
  className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-100 transition"
>
  View Campaign Emails
</Link>

                        

                      </div>

                    </td>

                  </tr>
                ))}

              </tbody>

            </table>

          </div>
        )}

      </div>

    </div>
  )
}
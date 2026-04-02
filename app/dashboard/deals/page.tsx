'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Deal = {
  id: string
  contact_id: string
  property_id: string
  assigned_user_id: string
  deal_type: string
  status: string
  created_at: string
}

export default function DealsPage() {
  const router = useRouter()

  const [deals, setDeals] = useState<Deal[]>([])
  const [contacts, setContacts] = useState<Record<string, string>>({})
  const [properties, setProperties] = useState<Record<string, string>>({})
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDeals()
  }, [])

  const loadDeals = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
      .single()

    if (!membership) return

    const accountId = membership.account_id

    const { data: dealData } = await supabase
      .from('deals')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })

    const dealsList = dealData || []
    setDeals(dealsList)

    const contactIds = [...new Set(dealsList.map(d => d.contact_id))]

    if (contactIds.length > 0) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .in('id', contactIds)

      const contactMap: Record<string, string> = {}

      contactData?.forEach(c => {
        contactMap[c.id] = `${c.first_name} ${c.last_name}`
      })

      setContacts(contactMap)
    }

    const propertyIds = [...new Set(dealsList.map(d => d.property_id))]

    if (propertyIds.length > 0) {
      const { data: propertyData } = await supabase
        .from('properties')
        .select('id, address')
        .in('id', propertyIds)

      const propertyMap: Record<string, string> = {}

      propertyData?.forEach(p => {
        propertyMap[p.id] = p.address
      })

      setProperties(propertyMap)
    }

    const res = await fetch(`/api/team-members?accountId=${accountId}`)
    const team = await res.json()

    const profileMap: Record<string, string> = {}

    team?.forEach((m: any) => {
      profileMap[m.id] = m.full_name
    })

    setProfiles(profileMap)

    setLoading(false)
  }

  const renderSection = (title: string, statuses: string[]) => {
    const sectionDeals = deals.filter(d => statuses.includes(d.status))

    if (sectionDeals.length === 0) return null

    return (
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-4 uppercase text-gray-500">
          {title}
        </h2>

        <table className="w-full text-left text-sm bg-white rounded-xl overflow-hidden shadow">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-medium">Contact</th>
              <th>Property</th>
              <th>Type</th>
              <th>Status</th>
              <th>Assigned</th>
              <th>Date</th>
            </tr>
          </thead>

          <tbody>
            {sectionDeals.map(deal => (
              <tr
                key={deal.id}
                onClick={() => router.push(`/dashboard/deals/${deal.id}`)}
                className="border-b hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-4 font-medium">
                  {contacts[deal.contact_id] || '-'}
                </td>

                <td>
                  {properties[deal.property_id] || '-'}
                </td>

                <td className="capitalize">
                  {deal.deal_type}
                </td>

                <td>
                  {deal.status}
                </td>

                <td>
                  {profiles[deal.assigned_user_id] || 'Unknown'}
                </td>

                <td className="text-gray-500">
                  {new Date(deal.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading deals...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-10">

      <div className="max-w-6xl mx-auto">

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-semibold">Deals</h1>

          <button
            onClick={() => router.push('/dashboard/deals/new')}
            className="px-4 py-2 bg-black text-white rounded"
          >
            + New Deal
          </button>
        </div>

        {deals.length === 0 && (
          <div className="text-gray-500">
            No deals found.
          </div>
        )}

        {renderSection('Active', ['Active'])}
        {renderSection('Sold Conditional', ['Sold Conditional'])}
        {renderSection('Sold Firm', ['Sold Firm'])}
        {renderSection('Closed', ['Closed'])}

      </div>

    </div>
  )
}
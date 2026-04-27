'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Deal = {
  id: string
  contact_id: string
  property_id: string
  assigned_user_id: string
  deal_type: string
  status: string
}

type Contact = {
  id: string
  first_name: string
  last_name: string
}

type Property = {
  id: string
  address: string
}

type Profile = {
  id: string
  full_name: string
}

export default function DealDetailPage() {
  const params = useParams()
  const router = useRouter()
  const dealId = params.id as string

  const [deal, setDeal] = useState<Deal | null>(null)
  const [contact, setContact] = useState<Contact | null>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])

  const [status, setStatus] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadDeal()
  }, [])

  const loadDeal = async () => {
    const { data: dealData } = await supabase
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .single()

    if (!dealData) return

    setDeal(dealData)
    setStatus(dealData.status)
    setAssignedUserId(dealData.assigned_user_id)

    const { data: contactData } = await supabase
      .from('contacts')
      .select('id, first_name, last_name')
      .eq('id', dealData.contact_id)
      .single()

    setContact(contactData)

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, address')
      .eq('id', dealData.property_id)
      .single()

    setProperty(propertyData)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
      .single()

    if (!membership) return

    const res = await fetch(`/api/team-members?accountId=${membership.account_id}`)
    const team = await res.json()

    setProfiles(team || [])
  }

  const handleSave = async () => {
    if (!deal) return

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
      .single()

    if (!membership) return

    const { error } = await supabase
      .from('deals')
      .update({
        status,
        assigned_user_id: assignedUserId
      })
      .eq('id', deal.id)
      .eq('account_id', membership.account_id)
// 🔥 AUTO-SYNC PROPERTY STATUS (SELLER DEALS ONLY)

if (!error && deal.deal_type === 'Seller') {

  let newPropertyStatus = ''

  if (status === 'Active') {
    newPropertyStatus = 'for_sale'
  }

  if (status === 'Sold Conditional' || status === 'Sold Firm') {
    newPropertyStatus = 'sold'
  }

  if (status === 'Closed') {
    newPropertyStatus = 'closed'
  }

  if (newPropertyStatus && deal.property_id) {
    await supabase
      .from('properties')
      .update({
        status: newPropertyStatus
      })
      .eq('id', deal.property_id)
      .eq('account_id', membership.account_id)
  }
}
    if (error) {
      console.log('DEAL UPDATE ERROR:', error)
      alert('Failed to save deal')
      setSaving(false)
      return
    }

    router.push('/dashboard/deals')
  }

  if (!deal) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading deal...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-10 flex justify-center">

      <div className="bg-white w-full max-w-5xl rounded-xl shadow p-10 space-y-8">

        <h1 className="text-2xl font-semibold">Edit Deal</h1>

        {/* TOP SECTION */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* CONTACT */}

          <div className="border rounded p-4 bg-gray-50">

            <p className="text-xs text-gray-500 mb-1">Contact</p>

            <button
              onClick={() => router.push(`/dashboard/contacts/${contact?.id}`)}
              className="text-lg font-medium text-blue-600 hover:underline"
            >
              {contact ? `${contact.first_name} ${contact.last_name}` : '-'}
            </button>

          </div>

          {/* PROPERTY */}

          <div className="border rounded p-4 bg-gray-50">

            <p className="text-xs text-gray-500 mb-1">Property</p>

            <button
              onClick={() => router.push(`/dashboard/properties/${property?.id}`)}
              className="text-lg font-medium text-blue-600 hover:underline"
            >
              {property?.address || '-'}
            </button>

          </div>

        </div>

        {/* DEAL DETAILS */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* DEAL TYPE */}

          <div>
            <label className="text-sm font-medium block mb-2">Deal Type</label>
            <div className="border p-3 rounded bg-gray-50">
              {deal.deal_type}
            </div>
          </div>

          {/* STATUS */}

          <div>
            <label className="text-sm font-medium block mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border p-3 rounded"
            >
              <option value="Active">Active</option>
              <option value="Sold Conditional">Sold Conditional</option>
              <option value="Sold Firm">Sold Firm</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          {/* ASSIGNED AGENT */}

          <div>
            <label className="text-sm font-medium block mb-2">Assigned Agent</label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="w-full border p-3 rounded"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* SAVE */}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-black text-white py-3 rounded-md hover:bg-gray-800"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

      </div>

    </div>
  )
}
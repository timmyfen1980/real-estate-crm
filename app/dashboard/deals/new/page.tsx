'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Contact = {
  id: string
  first_name: string
  last_name: string
  email: string
}

type Property = {
  id: string
  address: string
}

type TeamMember = {
  user_id: string
  full_name: string
}

export default function NewDealPage() {
  const router = useRouter()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  const [selectedContact, setSelectedContact] = useState<string>('')

  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<Contact[]>([])

  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const [dealType, setDealType] = useState<'buyer' | 'seller' | 'lease'>('buyer')
  const [dealStatus, setDealStatus] = useState('Active')

  const [propertySearch, setPropertySearch] = useState('')
  const [propertyResults, setPropertyResults] = useState<Property[]>([])
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)

  const [newAddress, setNewAddress] = useState('')
  const [assignedUserId, setAssignedUserId] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const userId = userData.user.id
    setAssignedUserId(userId)

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userId)
      .single()

    if (!membership) return

    const accountId = membership.account_id

    const { data: contactData } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email')
      .eq('account_id', accountId)

    setContacts(contactData || [])

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, address')
      .eq('account_id', accountId)

    setProperties(propertyData || [])

    const { data: members } = await supabase
  .from('account_users')
  .select('user_id')
  .eq('account_id', accountId)

if (!members) return

const userIds = members.map((m) => m.user_id)

const res = await fetch(`/api/team-members?accountId=${accountId}`)
const team = await res.json()

setTeamMembers(
  (team || []).map((m: any) => ({
    user_id: m.id,
    full_name: m.full_name,
  }))
)
  }

  const searchProperties = (query: string) => {
    if (!query.trim()) {
      setPropertyResults([])
      return
    }

    const results = properties.filter((p) =>
      p.address.toLowerCase().includes(query.toLowerCase())
    )

    setPropertyResults(results.slice(0, 10))
  }

  const searchContacts = (query: string) => {
    if (!query.trim()) {
      setContactResults([])
      return
    }

    const results = contacts.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.email}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )

    setContactResults(results.slice(0, 10))
  }

  const createDeal = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
      .single()

    if (!membership) return

    const accountId = membership.account_id

    let contactId = selectedContact

    if (!contactId) {
      if (!newFirstName.trim() || !newEmail.trim()) {
        alert('Enter contact info')
        return
      }

      const normalizedEmail = newEmail.toLowerCase().trim()

const { data: newContact, error } = await supabase
  .from('contacts')
  .insert([
    {
      account_id: accountId,
      created_by: userData.user.id,
      assigned_user_id: assignedUserId || userData.user.id,
      first_name: newFirstName,
      last_name: newLastName,
      email: normalizedEmail,
      lifecycle_stage: 'New',
      source: 'Deal Creation',
      original_source: 'Deal Creation',
    },
  ])
  .select('id')
  .single()

      if (error || !newContact) {
        alert('Error creating contact')
        return
      }

      contactId = newContact.id
    }

    let propertyId = selectedProperty?.id

    if (!propertyId) {
      if (!newAddress.trim()) {
        alert('Address required')
        return
      }

      const { data: propertyData, error } = await supabase
        .from('properties')
        .insert([
          {
            account_id: accountId,
            address: newAddress,
            user_id: userData.user.id,
          },
        ])
        .select()
        .single()

      if (error || !propertyData) {
        alert('Error creating property')
        return
      }

      propertyId = propertyData.id
    }
// 🚨 PREVENT DUPLICATE DEALS

const { data: existingDeal } = await supabase
  .from('deals')
  .select('id, status')
  .eq('property_id', propertyId)
  .eq('account_id', accountId)
  .maybeSingle()

if (existingDeal) {
  alert(`A deal already exists for this property (${existingDeal.status})`)
  return
}
    const { error: dealError } = await supabase.from('deals').insert([
  {
    account_id: accountId,
    contact_id: contactId,
    assigned_user_id: assignedUserId,
    property_id: propertyId,
    deal_type: dealType,
    status: dealStatus,
  },
])

if (dealError) {
  alert('Error creating deal')
  return
}

// 🔍 STEP 1 — CHECK FOR EXISTING LEAD
const { data: existingLead } = await supabase
  .from('leads')
  .select('id')
  .eq('contact_id', contactId)
  .eq('account_id', accountId)
  .maybeSingle()

// 🟢 STEP 2 — UPDATE OR CREATE

if (existingLead) {
  // UPDATE EXISTING LEAD
  await supabase
    .from('leads')
    .update({
      deal_type: dealType,
      status: dealStatus === 'Closed' ? 'Closed' : 'Client',
      assigned_user_id: assignedUserId,
    })
    .eq('id', existingLead.id)
} else {
  // CREATE NEW LEAD
  await supabase.from('leads').insert([
    {
      account_id: accountId,
      contact_id: contactId,
      assigned_user_id: assignedUserId,
      deal_type: dealType,
      status: dealStatus === 'Closed' ? 'Closed' : 'Client',
      source: 'Deal Creation',
    },
  ])
}

    
    const { data: existingLink } = await supabase
  .from('property_contacts')
  .select('id')
  .eq('contact_id', contactId)
  .eq('property_id', propertyId)
  .maybeSingle()

if (!existingLink) {
  await supabase.from('property_contacts').insert([
    {
      contact_id: contactId,
      property_id: propertyId,
    },
  ])
}

    alert('Deal created')
    router.push('/dashboard/contacts')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-10">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow space-y-6">

        <h1 className="text-2xl font-semibold">Create Deal</h1>

        {/* PROPERTY */}
        <div>
          <label className="text-sm text-gray-600">Property</label>

          <input
            value={propertySearch}
            onChange={(e) => {
              setPropertySearch(e.target.value)
              searchProperties(e.target.value)
            }}
            className="w-full border rounded-lg px-3 py-2 mt-1"
            placeholder="Search property..."
          />

          {propertyResults.length > 0 && (
            <div className="border mt-2 rounded-lg max-h-40 overflow-y-auto">
              {propertyResults.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedProperty(p)
                    setPropertySearch(p.address)
                    setNewAddress(p.address)
                    setPropertyResults([])
                  }}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  {p.address}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ADDRESS */}
        <div>
          <label className="text-sm text-gray-600">Property Address</label>
          <input
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mt-1"
          />
        </div>

        {/* CONTACT */}
        <div>
          <label className="text-sm text-gray-600">Contact</label>

          <input
            value={contactSearch}
            onChange={(e) => {
              setContactSearch(e.target.value)
              searchContacts(e.target.value)
              setSelectedContact('')
            }}
            className="w-full border rounded-lg px-3 py-2 mt-1"
            placeholder="Search contact..."
          />

          {contactResults.length > 0 && (
            <div className="border rounded-lg mt-2 max-h-40 overflow-y-auto">
              {contactResults.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedContact(c.id)
                    setContactSearch(`${c.first_name} ${c.last_name}`)
                    setContactResults([])
                  }}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                >
                  {c.first_name} {c.last_name} ({c.email})
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CREATE CONTACT */}
        {!selectedContact && (
          <div className="border rounded-lg p-4 bg-gray-50 space-y-2">
            <input
              value={newFirstName}
              onChange={(e) => setNewFirstName(e.target.value)}
              placeholder="First Name"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              value={newLastName}
              onChange={(e) => setNewLastName(e.target.value)}
              placeholder="Last Name"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
        )}

        {/* ASSIGNED */}
        <div>
          <label className="text-sm text-gray-600">Assigned Agent</label>
          <select
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mt-1"
          >
            {teamMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* TYPE */}
        <select
          value={dealType}
          onChange={(e) => setDealType(e.target.value as any)}
          className="w-full border rounded-lg px-3 py-2"
        >
          <option value="buyer">Buyer</option>
<option value="seller">Seller</option>
<option value="lease">Lease</option>
        </select>``

        {/* STATUS */}
        <select
          value={dealStatus}
          onChange={(e) => setDealStatus(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
        >
          <option value="Active">Active</option>
          <option value="Sold Conditional">Sold Conditional</option>
          <option value="Sold Firm">Sold Firm</option>
          <option value="Closed">Closed</option>
        </select>

        <button
          onClick={createDeal}
          className="bg-black text-white px-6 py-3 rounded-lg w-full"
        >
          Create Deal
        </button>

      </div>
    </div>
  )
}
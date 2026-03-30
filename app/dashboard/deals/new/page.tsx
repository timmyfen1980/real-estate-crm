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

export default function NewDealPage() {
  const router = useRouter()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [properties, setProperties] = useState<Property[]>([])

  const [selectedContact, setSelectedContact] = useState<string>('')

  const [dealType, setDealType] = useState<'Buyer' | 'Seller'>('Buyer')
  const [dealStatus, setDealStatus] = useState('Active')

  const [propertySearch, setPropertySearch] = useState('')
  const [propertyResults, setPropertyResults] = useState<Property[]>([])
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)

  const [newAddress, setNewAddress] = useState('')

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
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
  }

  useEffect(() => {
    loadData()
  }, [])

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

  const createDeal = async () => {
    if (!selectedContact) {
      alert('Select a contact')
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
      .single()

    if (!membership) return

    const accountId = membership.account_id

    // ✅ FIX: DEFINE contactId PROPERLY
    const contactId = selectedContact

    let propertyId = selectedProperty?.id

    // CREATE PROPERTY IF NEEDED
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

    const { error: dealError } = await supabase.from('deals').insert([
      {
        account_id: accountId,
        contact_id: contactId,
        assigned_user_id: userData.user.id,
        property_id: propertyId,
        deal_type: dealType,
        status: dealStatus,
      },
    ])

    if (dealError) {
      alert('Error creating deal')
      return
    }

    // ✅ FIX: NOW THIS WORKS
    await supabase.from('property_contacts').insert([
      {
        contact_id: contactId,
        property_id: propertyId,
      },
    ])

    alert('Deal created')
    router.push('/dashboard/contacts')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-10">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow space-y-6">

        <h1 className="text-2xl font-semibold">Create Deal</h1>

        {/* CONTACT */}
        <div>
          <label className="text-sm text-gray-600">Contact</label>
          <select
            value={selectedContact}
            onChange={(e) => setSelectedContact(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mt-1"
          >
            <option value="">Select contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name} ({c.email})
              </option>
            ))}
          </select>
        </div>

        {/* DEAL TYPE */}
        <div>
          <label className="text-sm text-gray-600">Deal Type</label>
          <select
            value={dealType}
            onChange={(e) =>
              setDealType(e.target.value as 'Buyer' | 'Seller')
            }
            className="w-full border rounded-lg px-3 py-2 mt-1"
          >
            <option value="Buyer">Buyer</option>
            <option value="Seller">Seller</option>
          </select>
        </div>

        {/* PROPERTY SEARCH */}
        {dealType === 'Seller' && (
          <div>
            <label className="text-sm text-gray-600">Search Property</label>
            <input
              value={propertySearch}
              onChange={(e) => {
                setPropertySearch(e.target.value)
                searchProperties(e.target.value)
                setSelectedProperty(null)
              }}
              className="w-full border rounded-lg px-3 py-2 mt-1"
              placeholder="Search existing properties..."
            />

            {propertyResults.length > 0 && (
              <div className="border mt-2 rounded-lg max-h-40 overflow-y-auto">
                {propertyResults.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedProperty(p)
                      setPropertySearch(p.address)
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
        )}

        {/* ADDRESS */}
        {!selectedProperty && (
          <div>
            <label className="text-sm text-gray-600">Property Address</label>
            <input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mt-1"
              placeholder="Enter address"
            />
          </div>
        )}

        {/* STATUS */}
        <div>
          <label className="text-sm text-gray-600">Deal Status</label>
          <select
            value={dealStatus}
            onChange={(e) => setDealStatus(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mt-1"
          >
            <option value="Active">Active</option>
            <option value="Sold Conditional">Sold Conditional</option>
            <option value="Sold Firm">Sold Firm</option>
            <option value="Closed">Closed</option>
          </select>
        </div>

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
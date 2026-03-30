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

  // ✅ CONTACT SEARCH
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<Contact[]>([])
  const [selectedContactData, setSelectedContactData] = useState<Contact | null>(null)

  // ✅ CREATE CONTACT
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newEmail, setNewEmail] = useState('')

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

    // ✅ CREATE CONTACT IF NEEDED
    if (!contactId) {
      if (!newFirstName.trim() || !newEmail.trim()) {
        alert('Enter contact info')
        return
      }

      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert([
          {
            first_name: newFirstName,
            last_name: newLastName,
            email: newEmail,
            account_id: accountId,
          },
        ])
        .select()
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

        {/* CONTACT SEARCH */}
        <div>
          <label className="text-sm text-gray-600">Contact</label>

          <input
            value={contactSearch}
            onChange={(e) => {
              setContactSearch(e.target.value)
              searchContacts(e.target.value)
              setSelectedContact('')
              setSelectedContactData(null)
            }}
            className="w-full border rounded-lg px-3 py-2 mt-1"
            placeholder="Search contact..."
          />

          {contactResults.length > 0 && !selectedContactData && (
            <div className="border rounded-lg mt-2 max-h-40 overflow-y-auto">
              {contactResults.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedContact(c.id)
                    setSelectedContactData(c)
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
            <div className="text-sm font-medium">Create New Contact</div>

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
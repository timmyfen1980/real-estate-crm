'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Property = {
  id: string
  address: string
  city: string | null
  province: string | null
  postal_code: string | null
  status: string
  image_url?: string
  feature_sheet_url?: string
  account_id: string
}

type Seller = {
  id: string
  first_name: string
  last_name: string
}

type OpenHouse = {
  id: string
  event_date: string
  start_time: string
  end_time: string
}

export default function PropertyPage() {
  const params = useParams()
  const router = useRouter()
  const propertyId = params.id as string

  const [property, setProperty] = useState<Property | null>(null)
  const [sellers, setSellers] = useState<Seller[]>([])
  const [openHouses, setOpenHouses] = useState<OpenHouse[]>([])

  const [loading, setLoading] = useState(true)

  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [province, setProvince] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [status, setStatus] = useState('coming_soon')

  const [newImage, setNewImage] = useState<File | null>(null)
  const [newFeature, setNewFeature] = useState<File | null>(null)

  const [saving, setSaving] = useState(false)
  const [sellerModalOpen, setSellerModalOpen] = useState(false)
const [contactSearch, setContactSearch] = useState('')
const [searchResults, setSearchResults] = useState<Seller[]>([])
const [selectedRole, setSelectedRole] = useState<'seller' | 'buyer' | 'tenant' | 'landlord'>('seller')

  const loadData = async () => {
    const { data: propertyData } = await supabase
      .from('properties')
      .select(
        'id,address,city,province,postal_code,status,image_url,feature_sheet_url,account_id'
      )
      .eq('id', propertyId)
      .single()

    if (propertyData) {
      setProperty(propertyData)
      setAddress(propertyData.address || '')
      setCity(propertyData.city || '')
      setProvince(propertyData.province || '')
      setPostalCode(propertyData.postal_code || '')
      setStatus(propertyData.status || 'coming_soon')
    }

    const { data: sellerData } = await supabase
      .from('property_contacts')
      .select('contacts(id,first_name,last_name)')
      .eq('property_id', propertyId)

    if (sellerData) {
      const parsed = sellerData.map((s: any) => s.contacts)
      setSellers(parsed)
    }

    const { data: openHouseData } = await supabase
      .from('open_house_events')
      .select('id,event_date,start_time,end_time')
      .eq('property_id', propertyId)

    if (openHouseData) setOpenHouses(openHouseData)

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])
const removeSeller = async (contactId: string) => {

  await supabase
    .from('property_contacts')
    .delete()
    .eq('property_id', propertyId)
    .eq('contact_id', contactId)

  setSellers(prev => prev.filter(s => s.id !== contactId))

}
const searchContacts = async (query: string) => {

  setContactSearch(query)

  if (!query || query.length < 2) {
    setSearchResults([])
    return
  }

  const { data } = await supabase
    .from('contacts')
    .select('id, first_name, last_name')
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
    .limit(10)

  setSearchResults(data || [])

}
const addSeller = async (contact: Seller) => {

  console.log('ROLE BEING SENT:', selectedRole)

  const { error } = await supabase
    .from('property_contacts')
    .insert({
      property_id: propertyId,
      contact_id: contact.id,
      role: selectedRole
    })

  if (error) {
    console.log('INSERT ERROR:', error)
    alert('Failed to add contact')
    return
  }

  setSellers(prev => [...prev, contact])

  setSellerModalOpen(false)
  setContactSearch('')
  setSearchResults([])
  setSelectedRole('seller')
}
  const handleSave = async () => {
    if (!property) return

    setSaving(true)
const { data: userData } = await supabase.auth.getUser()
if (!userData.user) return

const { data: membership } = await supabase
  .from('account_users')
  .select('account_id')
  .eq('user_id', userData.user.id)
  .single()

if (!membership) return

const { error: updateError } = await supabase
  .from('properties')
  .update({
    address,
    city,
    province,
    postal_code: postalCode,
    status,
  })
  .eq('id', property.id)
  .eq('account_id', membership.account_id)

if (updateError) {
  console.log('PROPERTY UPDATE ERROR:', updateError)
  alert('Failed to save changes — you may not have permission')
  setSaving(false)
  return
}

if (updateError) {
  console.log('PROPERTY UPDATE ERROR:', updateError)
  alert('Failed to save changes — you may not have permission')
  setSaving(false)
  return
}

    if (newImage) {
      const imagePath = `${property.account_id}/${property.id}/image.${newImage.name
        .split('.')
        .pop()}`

      await supabase.storage
        .from('property-images')
        .upload(imagePath, newImage, { upsert: true })

      const { data } = supabase.storage
        .from('property-images')
        .getPublicUrl(imagePath)

      await supabase
        .from('properties')
        .update({ image_url: data.publicUrl })
        .eq('id', property.id)
    }

    if (newFeature) {
      const docPath = `${property.account_id}/${property.id}/feature.${newFeature.name
        .split('.')
        .pop()}`

      await supabase.storage
        .from('property-documents')
        .upload(docPath, newFeature, { upsert: true })

      const { data } = supabase.storage
        .from('property-documents')
        .getPublicUrl(docPath)

      await supabase
        .from('properties')
        .update({ feature_sheet_url: data.publicUrl })
        .eq('id', property.id)
    }

    await loadData()

    setNewImage(null)
    setNewFeature(null)
    setSaving(false)
  }

  if (loading || !property) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-10 flex justify-center">

      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-lg p-10 space-y-10">

        {/* HEADER */}

        <div className="flex justify-between items-start">

          <div>
            <h1 className="text-2xl font-bold">{address}</h1>
            <p className="text-gray-500">
              {city} {province} {postalCode}
            </p>
          </div>

          <button
            onClick={() =>
              router.push(`/dashboard/open-houses/new?property_id=${property.id}`)
            }
            className="px-5 py-2 border border-black rounded-md hover:bg-black hover:text-white transition"
          >
            Create Open House
          </button>

        </div>

        {/* IMAGE */}

        <div>

          {newImage ? (
            <img
              src={URL.createObjectURL(newImage)}
              className="w-full h-72 object-cover rounded-lg mb-4"
            />
          ) : property.image_url ? (
            <img
              src={property.image_url}
              className="w-full h-72 object-cover rounded-lg mb-4"
            />
          ) : (
            <div className="w-full h-72 bg-gray-100 flex items-center justify-center rounded-lg text-gray-400">
              No image uploaded
            </div>
          )}

          <input
            id="imageUpload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) =>
              e.target.files && setNewImage(e.target.files[0])
            }
          />

          <button
            onClick={() => document.getElementById('imageUpload')?.click()}
            className="border px-4 py-2 rounded-md hover:bg-gray-100 transition"
          >
            Upload Image
          </button>

        </div>

        {/* PROPERTY INFO */}

        <div className="grid grid-cols-2 gap-8">

          <div>
            <label className="text-sm font-medium">Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full border p-3 rounded-md"
            />
          </div>

          <div>
            <label className="text-sm font-medium">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full border p-3 rounded-md"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Province</label>
            <input
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="w-full border p-3 rounded-md"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Postal Code</label>
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className="w-full border p-3 rounded-md"
            />
          </div>

        </div>

        {/* STATUS */}

        <div>

          <label className="text-sm font-medium mb-2 block">
            Property Status
          </label>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border p-3 rounded-md w-full"
          >
            <option value="coming_soon">Coming Soon</option>

<option value="for_sale">For Sale</option>
<option value="sold">Sold</option>

<option value="for_lease">For Lease</option>
<option value="leased">Leased</option>

<option value="closed">Closed</option>
          </select>

        </div>

        {/* SELLERS */}

        <div>


          <div>

  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-semibold">Sellers</h2>

    <button
  onClick={() => setSellerModalOpen(true)}
  className="text-sm border px-3 py-1 rounded-md hover:bg-gray-100 transition"
>
  + Add Seller
</button>
  </div>

  {sellers.length === 0 && (
    <div className="text-sm text-gray-400 mb-3">
      No sellers linked to this property
    </div>
  )}

  {sellers.map((seller) => (
  <div
    key={seller.id}
    className="flex justify-between items-center border p-4 rounded-md mb-2 bg-white"
  >

    <div className="flex items-center gap-4">

      <span className="font-medium">
        {seller.first_name} {seller.last_name}
<span className="ml-2 text-xs text-gray-400 uppercase">
  ({(seller as any).role || 'seller'})
</span>
      </span>

      <button
        onClick={() =>
          router.push(`/dashboard/contacts/${seller.id}`)
        }
        className="text-blue-600 text-sm hover:underline"
      >
        View Contact
      </button>

    </div>

    <button
      onClick={() => removeSeller(seller.id)}
      className="text-red-500 text-sm hover:underline"
    >
      Remove
    </button>

  </div>
))}

</div>

        </div>

        {/* OPEN HOUSES */}

        <div>

 <div>

  <div className="flex items-center justify-between mb-4">
    <h2 className="text-lg font-semibold">Open Houses</h2>

    <button
      onClick={() =>
        router.push(`/dashboard/open-houses/new?property_id=${property.id}`)
      }
      className="text-sm border px-3 py-1 rounded-md hover:bg-gray-100 transition"
    >
      + Create Open House
    </button>
  </div>

  {openHouses.length === 0 && (
    <div className="text-sm text-gray-400">
      No open houses scheduled
    </div>
  )}

  <div className="space-y-2">

    {openHouses.map((oh) => (

      <div
        key={oh.id}
        className="flex items-center justify-between border rounded-md px-4 py-3"
      >

        <div className="text-sm font-medium">
          {new Date(oh.event_date).toLocaleDateString()}
        </div>

        <button
          onClick={() =>
            router.push(`/dashboard/open-houses/${oh.id}`)
          }
          className="text-sm text-blue-600 hover:underline"
        >
          Edit
        </button>

      </div>

    ))}

  </div>

</div>

        </div>

        {/* FEATURE SHEET */}

        <div>

          <h2 className="text-lg font-semibold mb-4">
            Feature Sheet
          </h2>

          {property.feature_sheet_url && (
            <a
              href={property.feature_sheet_url}
              target="_blank"
              className="text-blue-600 underline block mb-4"
            >
              View Current Feature Sheet
            </a>
          )}

          <input
            id="featureUpload"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) =>
              e.target.files && setNewFeature(e.target.files[0])
            }
          />

          <button
            onClick={() =>
              document.getElementById('featureUpload')?.click()
            }
            className="border px-4 py-2 rounded-md hover:bg-gray-100"
          >
            Upload Feature Sheet
          </button>

        </div>

        {/* SAVE */}

<button
  onClick={handleSave}
  disabled={saving}
  className="w-full bg-black text-white py-3 rounded-xl hover:bg-gray-800 transition"
>
  {saving ? 'Saving...' : 'Save Changes'}
</button>

{/* SELLER MODAL */}

{sellerModalOpen && (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
    <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl p-8 space-y-6">

      <h2 className="text-xl font-semibold">
        Add Seller
      </h2>
<select
  value={selectedRole}
  onChange={(e) =>
    setSelectedRole(e.target.value as 'seller' | 'buyer' | 'tenant' | 'landlord')
  }
  className="w-full border rounded-lg px-4 py-3 mb-3"
>
  <option value="seller">Seller</option>
  <option value="buyer">Buyer</option>
  <option value="tenant">Tenant</option>
  <option value="landlord">Landlord</option>
</select>
      <input
        type="text"
        placeholder="Search contacts..."
        value={contactSearch}
        onChange={(e) => searchContacts(e.target.value)}
        className="w-full border rounded-lg px-4 py-3"
      />

      <div className="space-y-2 max-h-64 overflow-y-auto">

        {searchResults.map((contact) => (

          <button
            key={contact.id}
            onClick={() => addSeller(contact)}
            className="w-full text-left border rounded-lg px-4 py-3 hover:bg-gray-50"
          >
            {contact.first_name} {contact.last_name}
          </button>

        ))}

      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setSellerModalOpen(false)}
          className="px-5 py-2 border rounded-lg"
        >
          Cancel
        </button>
      </div>

    </div>
  </div>
)}

      </div>

    </div>
  )
}
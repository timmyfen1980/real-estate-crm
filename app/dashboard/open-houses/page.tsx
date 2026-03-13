'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { QRCodeCanvas } from 'qrcode.react'
import Link from 'next/link'

type Property = {
  id: string
  address: string
  image_url?: string
}

type OpenHouseEvent = {
  id: string
  property_id: string
  event_date: string
  start_time: string | null
  end_time: string | null
  is_active: boolean
}

export default function OpenHousesPage() {
  const router = useRouter()

  const [properties, setProperties] = useState<Property[]>([])
  const [events, setEvents] = useState<OpenHouseEvent[]>([])
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [creationMode, setCreationMode] = useState<'existing' | 'new' | null>(null)
const [newAddress, setNewAddress] = useState('')
const [newImageFile, setNewImageFile] = useState<File | null>(null)
const [newFeatureFile, setNewFeatureFile] = useState<File | null>(null)
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [selectedProperty, setSelectedProperty] = useState('')
  const todayString = new Date().toISOString().split('T')[0]
const [eventDate, setEventDate] = useState(todayString)
const [startTime, setStartTime] = useState('14:00')
const [endTime, setEndTime] = useState('16:00')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const createLockRef = useRef(false)
  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 2000)
  }

  const loadData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/')
      return
    }

    const { data: membership } = await supabase
  .from('account_users')
  .select('account_id')
  .eq('user_id', user.id)
  .single()

    if (!membership) return

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, address, image_url')
      .eq('account_id', membership.account_id)

    setProperties(propertyData || [])

    const { data: eventData } = await supabase
      .from('open_house_events')
      .select('*')
      .eq('account_id', membership.account_id)
      .order('event_date', { ascending: false })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const updatedEvents: OpenHouseEvent[] = []

    for (const event of eventData || []) {
      const eventDateObj = new Date(event.event_date)
      const expireDate = new Date(eventDateObj)
      expireDate.setDate(expireDate.getDate() + 1)

      if (event.is_active && today >= expireDate) {
        await supabase
          .from('open_house_events')
          .update({ is_active: false })
          .eq('id', event.id)

        event.is_active = false
      }

      updatedEvents.push(event)
    }

    setEvents(updatedEvents)

    const counts: Record<string, number> = {}

    for (const event of updatedEvents) {
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('open_house_event_id', event.id)

      counts[event.id] = count || 0
    }

    setLeadCounts(counts)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])
  const openRunAgainModal = (propertyId: string) => {
  const todayString = new Date().toISOString().split('T')[0]

  setSelectedProperty(propertyId)
  setEventDate(todayString)
  setStartTime('14:00')
  setEndTime('16:00')
  setModalOpen(true)
}
const createEvent = async () => {
  if (createLockRef.current) return
  createLockRef.current = true
  setIsSubmitting(true)

  try {
    if (!eventDate) throw new Error('Event date required')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) throw new Error('User not authenticated')

    const { data: membership, error: membershipError } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', user.id)
      .single()

    if (membershipError || !membership)
      throw new Error('Account membership not found')

    let propertyId = selectedProperty

    if (creationMode === 'new') {
      if (!newAddress) throw new Error('Property address required')

      const { data: propertyInsert, error: propertyError } = await supabase
        .from('properties')
        .insert([
          {
            address: newAddress,
            account_id: membership.account_id,
            user_id: user.id,
          },
        ])
        .select()
        .single()

      if (propertyError || !propertyInsert)
        throw new Error(propertyError?.message || 'Property creation failed')

      propertyId = propertyInsert.id

      if (newImageFile) {
        const imagePath = `${membership.account_id}/${propertyId}/image.${newImageFile.name.split('.').pop()}`

        const { error: uploadError } = await supabase.storage
          .from('property-images')
          .upload(imagePath, newImageFile, { upsert: true })

        if (uploadError) throw new Error(uploadError.message)

        const { data } = supabase.storage
          .from('property-images')
          .getPublicUrl(imagePath)

        await supabase
          .from('properties')
          .update({ image_url: data.publicUrl })
          .eq('id', propertyId)
      }

      if (newFeatureFile) {
        const docPath = `${membership.account_id}/${propertyId}/feature.${newFeatureFile.name.split('.').pop()}`

        const { error: uploadError } = await supabase.storage
          .from('property-documents')
          .upload(docPath, newFeatureFile, { upsert: true })

        if (uploadError) throw new Error(uploadError.message)

        const { data } = supabase.storage
          .from('property-documents')
          .getPublicUrl(docPath)

        await supabase
          .from('properties')
          .update({ feature_sheet_url: data.publicUrl })
          .eq('id', propertyId)
      }
    }

    if (!propertyId) throw new Error('Property required')

    const { error: deactivateError } = await supabase
      .from('open_house_events')
      .update({ is_active: false })
      .eq('property_id', propertyId)

    if (deactivateError) throw new Error(deactivateError.message)

    const { error: insertError } = await supabase
      .from('open_house_events')
      .insert([
        {
          property_id: propertyId,
          account_id: membership.account_id,
          user_id: user.id,
          event_date: eventDate,
          start_time: startTime || null,
          end_time: endTime || null,
          is_active: true,
        },
      ])

    if (insertError) throw new Error(insertError.message)

    setModalOpen(false)
    setCreationMode(null)
    setSelectedProperty('')
    setNewAddress('')
    setNewImageFile(null)
    setNewFeatureFile(null)
    setEventDate(todayString)
    setStartTime('14:00')
    setEndTime('16:00')

    showToast('Open house created')
    loadData()

  } catch (err: any) {
    showToast(err.message || 'Failed creating open house')
  } finally {
    createLockRef.current = false
    setIsSubmitting(false)
  }
}

  const endEvent = async (eventId: string) => {
    await supabase
      .from('open_house_events')
      .update({ is_active: false })
      .eq('id', eventId)

    setConfirmEndId(null)
    showToast('Open house ended')
    loadData()
  }

  const formatDateTime = (event: OpenHouseEvent) => {
    const date = new Date(event.event_date).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })

    if (event.start_time && event.end_time) {
      return `${date} · ${event.start_time} - ${event.end_time}`
    }

    return date
  }

  const activeEvents = events.filter(e => e.is_active)
  const pastEvents = events.filter(e => !e.is_active)
const generateTimeOptions = () => {
  const options = []
  for (let hour = 8; hour <= 20; hour++) {
    for (let minute of [0, 30]) {
      const h = hour.toString().padStart(2, '0')
      const m = minute.toString().padStart(2, '0')
      const value = `${h}:${m}`

      const labelHour = hour % 12 === 0 ? 12 : hour % 12
      const ampm = hour < 12 ? 'AM' : 'PM'
      const label = `${labelHour}:${m} ${ampm}`

      options.push(
        <option key={value} value={value}>
          {label}
        </option>
      )
    }
  }
  return options
}
  if (loading) {
    return <div className="p-10">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-100 p-10">

      {toast && (
        <div className="fixed bottom-6 right-6 bg-black text-white px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold">Open Houses</h1>

        <button
          onClick={() => setModalOpen(true)}
          className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition cursor-pointer"
        >
          Create Open House
        </button>
      </div>

      {/* ACTIVE */}
      <h2 className="text-xl font-semibold mb-4">Active</h2>

      <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-6 mb-12">
        {activeEvents.map((event) => {
          const property = properties.find(p => p.id === event.property_id)

          return (
            <div key={event.id} className="bg-white rounded-xl shadow-md overflow-hidden">

              {property?.image_url && (
                <img
                  src={property.image_url}
                  alt="Property"
                  className="h-36 w-full object-cover"
                />
              )}

              <div className="p-4">

                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-sm truncate">
                    {property?.address}
                  </h3>

                  <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
                    Active
                  </span>
                </div>

                <p className="text-xs text-gray-500 mb-2">
                  {formatDateTime(event)}
                </p>

                <div className="mb-3">
                  <span className="inline-block bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full">
                    {leadCounts[event.id] || 0} Leads
                  </span>
                </div>
                {/* QR + Public Link */}
<div className="mb-4 mt-4 text-center border-t pt-4">
  <QRCodeCanvas
    value={`${window.location.origin}/open-house/${event.id}`}
    size={120}
  />

  <p className="text-xs text-gray-500 mt-3 break-all">
    {`${window.location.origin}/open-house/${event.id}`}
  </p>

  <button
    onClick={() => {
      navigator.clipboard.writeText(
        `${window.location.origin}/open-house/${event.id}`
      )
      showToast('Link copied')
    }}
    className="mt-2 text-xs underline text-gray-600 hover:text-black"
  >
    Copy Link
  </button>
</div><div className="grid grid-cols-4 gap-2">

  <Link
  href={`/dashboard/open-houses/${event.id}`}
  className="text-xs border px-2 py-2 rounded text-center hover:bg-gray-100 transition"
>
  Edit Event
</Link>

  <Link
    href={`/dashboard/properties/${event.property_id}`}
    className="text-xs border px-2 py-2 rounded text-center hover:bg-gray-100 transition"
  >
    Edit Property
  </Link>

  <button
    onClick={() => setConfirmEndId(event.id)}
    className="text-xs border px-2 py-2 rounded hover:bg-gray-100 transition"
  >
    End
  </button>

  <Link
    href={`/dashboard/open-houses/${event.id}/leads`}
    className="text-xs bg-black text-white px-2 py-2 rounded text-center hover:bg-gray-800 transition"
  >
    Leads
  </Link>

</div>

              </div>
            </div>
          )
        })}
      </div>

      {/* PAST */}
      <h2 className="text-xl font-semibold mb-4">Past Open Houses</h2>

      <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-6">
        {pastEvents.map((event) => {
          const property = properties.find(p => p.id === event.property_id)

          return (
            <div key={event.id} className="bg-white rounded-xl shadow-sm overflow-hidden opacity-90">

              {property?.image_url && (
                <img
                  src={property.image_url}
                  alt="Property"
                  className="h-32 w-full object-cover"
                />
              )}

              <div className="p-4">

                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-sm truncate">
                    {property?.address}
                  </h3>

                  <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">
                    Completed
                  </span>
                </div>

                <p className="text-xs text-gray-500 mb-3">
                  {formatDateTime(event)}
                </p>

                <div className="mb-3">
                  <span className="inline-block bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
                    {leadCounts[event.id] || 0} Leads
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">

  <button
    onClick={() => openRunAgainModal(event.property_id)}
    className="text-xs border px-2 py-2 rounded hover:bg-gray-100 transition"
  >
    Run Again
  </button>

  <Link
    href={`/dashboard/properties/${event.property_id}`}
    className="text-xs border px-2 py-2 rounded text-center hover:bg-gray-100 transition"
  >
    Edit Property
  </Link>

  <Link
    href={`/dashboard/open-houses/${event.id}/leads`}
    className="text-xs border px-2 py-2 rounded text-center hover:bg-gray-100 transition"
  >
    Leads
  </Link>

</div>

              </div>
            </div>
          )
        })}

        {pastEvents.length === 0 && (
          <p className="text-gray-500">No past open houses yet.</p>
        )}
      </div>
{modalOpen && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
    <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">

      <div className="p-8">

        <h2 className="text-xl font-semibold mb-6 text-center">
          Create Open House
        </h2>

        {!creationMode && (
          <>
            <div className="flex flex-col gap-4 mb-8">
              <button
                onClick={() => setCreationMode('new')}
                className="bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition"
              >
                Create First Open House
              </button>

              <button
                onClick={() => setCreationMode('existing')}
                className="border border-gray-300 py-3 rounded-lg font-medium hover:bg-gray-100 transition"
              >
                Create From Existing Property
              </button>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => setModalOpen(false)}
                className="text-sm text-gray-500 hover:text-black underline"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {creationMode && (
          <div className="space-y-6">

            {creationMode === 'existing' && (
              <select
                className="w-full p-3 border rounded-lg"
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
              >
                <option value="">Select Property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}
                  </option>
                ))}
              </select>
            )}

            {creationMode === 'new' && (
  <div className="space-y-6">

    {/* Address */}
    <div>
      <label className="block text-sm font-medium mb-2 text-gray-700">
        Property Address
      </label>
      <input
        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-black focus:outline-none"
        placeholder="123 Main Street, Whitby"
        value={newAddress}
        onChange={(e) => setNewAddress(e.target.value)}
      />
    </div>

    {/* Image Upload */}
    <div className="border rounded-xl p-4 bg-gray-50">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-medium text-gray-700">
          Property Image
        </span>
        {newImageFile && (
          <span className="text-xs text-green-600 font-medium">
            ✓ Selected
          </span>
        )}
      </div>

      {newImageFile && (
        <div className="mb-3">
          <img
            src={URL.createObjectURL(newImageFile)}
            alt="Preview"
            className="w-full h-40 object-cover rounded-lg border"
          />
        </div>
      )}

      <button
        onClick={() =>
          document.getElementById('imageUpload')?.click()
        }
        className="w-full border border-gray-300 rounded-lg py-2 bg-white hover:bg-gray-100 transition text-sm"
      >
        {newImageFile ? 'Change Image' : 'Select Property Image'}
      </button>

      <input
        id="imageUpload"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) =>
          e.target.files && setNewImageFile(e.target.files[0])
        }
      />
    </div>

    {/* Feature Sheet Upload */}
    <div className="border rounded-xl p-4 bg-gray-50">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-medium text-gray-700">
          Feature Sheet (PDF)
        </span>
        {newFeatureFile && (
          <span className="text-xs text-green-600 font-medium">
            ✓ Selected
          </span>
        )}
      </div>

      {newFeatureFile && (
        <div className="mb-3 p-3 bg-white border rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 text-red-600 flex items-center justify-center rounded">
              PDF
            </div>
            <div className="text-sm text-gray-700 truncate max-w-[180px]">
              {newFeatureFile.name}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() =>
          document.getElementById('featureUpload')?.click()
        }
        className="w-full border border-gray-300 rounded-lg py-2 bg-white hover:bg-gray-100 transition text-sm"
      >
        {newFeatureFile ? 'Change PDF' : 'Upload Feature Sheet'}
      </button>

      <input
        id="featureUpload"
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) =>
          e.target.files && setNewFeatureFile(e.target.files[0])
        }
      />
    </div>

  </div>
)}

            <div className="border-t pt-6">
              <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wide">
                Open House Date & Time
              </h3>

              <input
                type="date"
                className="w-full mb-4 p-3 border rounded-lg"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-4">
                <select
                  className="w-full p-3 border rounded-lg"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                >
                  {generateTimeOptions()}
                </select>

                <select
                  className="w-full p-3 border rounded-lg"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                >
                  {generateTimeOptions()}
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4">
              <button
                onClick={() => setCreationMode(null)}
                className="text-sm text-gray-500 hover:text-black underline"
              >
                Back
              </button>

              <button
  onClick={createEvent}
  disabled={isSubmitting}
  className={`bg-black text-white px-8 py-3 rounded-xl font-medium transition ${
    isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800'
  }`}
>
  {isSubmitting ? 'Creating...' : 'Create Open House'}
</button>
            </div>

          </div>
        )}

      </div>
    </div>
  </div>
)}
      {confirmEndId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-3">
              End Open House?
            </h3>

            <p className="text-sm text-gray-600 mb-6">
              This event has collected {leadCounts[confirmEndId] || 0} leads.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmEndId(null)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={() => endEvent(confirmEndId)}
                className="bg-black text-white px-4 py-2 rounded"
              >
                Confirm End
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
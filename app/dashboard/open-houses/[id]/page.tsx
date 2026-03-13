'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type OpenHouseEvent = {
  id: string
  property_id: string
  event_date: string
  start_time: string | null
  end_time: string | null
  is_active: boolean
  ask_working_with_realtor: boolean
  ask_hear_about: boolean
  ask_buyer_stage: boolean
}

type Property = {
  id: string
  address: string
}

export default function EditOpenHousePage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [event, setEvent] = useState<OpenHouseEvent | null>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)

  const [eventDate, setEventDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  const [askWorking, setAskWorking] = useState(true)
  const [askHearAbout, setAskHearAbout] = useState(true)
  const [askBuyerStage, setAskBuyerStage] = useState(true)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const loadData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/')
      return
    }

    const { data: eventData } = await supabase
      .from('open_house_events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (!eventData) {
      router.push('/dashboard/open-houses')
      return
    }

    setEvent(eventData)
    setEventDate(eventData.event_date)
    setStartTime(eventData.start_time || '')
    setEndTime(eventData.end_time || '')

    setAskWorking(eventData.ask_working_with_realtor ?? true)
    setAskHearAbout(eventData.ask_hear_about ?? true)
    setAskBuyerStage(eventData.ask_buyer_stage ?? true)

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, address')
      .eq('id', eventData.property_id)
      .single()

    setProperty(propertyData || null)
    setLoading(false)
  }

  useEffect(() => {
    if (eventId) loadData()
  }, [eventId])

  const handleSave = async () => {
    if (!event || !event.is_active) return

    setSaving(true)
    setSaved(false)

    await supabase
      .from('open_house_events')
      .update({
        event_date: eventDate,
        start_time: startTime || null,
        end_time: endTime || null,
        ask_working_with_realtor: askWorking,
        ask_hear_about: askHearAbout,
        ask_buyer_stage: askBuyerStage,
      })
      .eq('id', event.id)

    setSaving(false)
    setSaved(true)

    setTimeout(() => setSaved(false), 3000)
  }

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

  if (loading || !event || !property) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-10 flex justify-center">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-lg p-10 space-y-8">

        <div>
          <h1 className="text-2xl font-bold">
            Edit Open House
          </h1>
          <p className="text-gray-500 mt-2">
            {property.address}
          </p>
        </div>

        {!event.is_active && (
          <div className="p-4 bg-gray-100 border rounded-lg text-sm text-gray-600">
            This open house is completed and cannot be edited.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Event Date
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              disabled={!event.is_active}
              className="w-full p-3 border rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Start Time
              </label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={!event.is_active}
                className="w-full p-3 border rounded-lg"
              >
                <option value="">Select</option>
                {generateTimeOptions()}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                End Time
              </label>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={!event.is_active}
                className="w-full p-3 border rounded-lg"
              >
                <option value="">Select</option>
                {generateTimeOptions()}
              </select>
            </div>
          </div>
        </div>

        {/* Sign-In Question Toggles */}
        <div className="border-t pt-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Sign-In Questions
          </h3>

          <label className="flex items-center justify-between">
            <span>Ask “Working With Realtor”</span>
            <input
              type="checkbox"
              checked={askWorking}
              onChange={(e) => setAskWorking(e.target.checked)}
              disabled={!event.is_active}
            />
          </label>

          <label className="flex items-center justify-between">
            <span>Ask “How Did You Hear About”</span>
            <input
              type="checkbox"
              checked={askHearAbout}
              onChange={(e) => setAskHearAbout(e.target.checked)}
              disabled={!event.is_active}
            />
          </label>

          <label className="flex items-center justify-between">
            <span>Ask Buyer Stage</span>
            <input
              type="checkbox"
              checked={askBuyerStage}
              onChange={(e) => setAskBuyerStage(e.target.checked)}
              disabled={!event.is_active}
            />
          </label>
        </div>

        {event.is_active && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-black text-white py-3 rounded-xl font-medium hover:bg-gray-800 transition"
          >
            {saving ? 'Saving Changes...' : 'Save Changes'}
          </button>
        )}

        {saved && (
          <p className="text-center text-green-600 text-sm">
            Event updated successfully
          </p>
        )}
      </div>
    </div>
  )
}
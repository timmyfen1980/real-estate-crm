'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Property = {
  id: string
  address: string
  image_url?: string
  account_id?: string
}

type OpenHouseEvent = {
  id: string
  property_id: string
  event_date: string
  ask_working_with_realtor: boolean
  ask_hear_about: boolean
  ask_buyer_stage: boolean
}

export default function OpenHousePage() {
  const params = useParams()
  const eventId = params.id as string

  const [branding, setBranding] = useState<any>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [event, setEvent] = useState<OpenHouseEvent | null>(null)
const [agent, setAgent] = useState<any>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [wantsFeatureSheet, setWantsFeatureSheet] = useState(true)

  const [workingWithRealtor, setWorkingWithRealtor] = useState<boolean | null>(null)
  const [realtorName, setRealtorName] = useState('')

  const [hearAbout, setHearAbout] = useState('')
  const [hearAboutOther, setHearAboutOther] = useState('')

  const [buyerStage, setBuyerStage] = useState('')

  const [submitted, setSubmitted] = useState(false)
  useEffect(() => {
  if (submitted) {
    const timer = setTimeout(() => {
      setSubmitted(false)
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      setWantsFeatureSheet(true)
      setWorkingWithRealtor(null)
      setRealtorName('')
      setHearAbout('')
      setHearAboutOther('')
      setBuyerStage('')
    }, 4000)

    return () => clearTimeout(timer)
  }
}, [submitted])
useEffect(() => {
  const loadData = async () => {
    const { data: eventData, error: eventError } = await supabase
      .from('open_house_events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError || !eventData) {
      console.error('EVENT LOAD ERROR:', eventError)
      return
    }

    setEvent(eventData)

    const { data: propertyData, error: propertyError } = await supabase
      .from('properties')
      .select('id, address, image_url, account_id')
      .eq('id', eventData.property_id)
      .single()

    if (propertyError || !propertyData) {
      console.error('PROPERTY LOAD ERROR:', propertyError)
      return
    }

    setProperty(propertyData)

    // 🔥 GET AGENT (THIS IS THE ONLY SOURCE OF "PRESENTED BY")
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, agent_photo_url, email, phone')
      .eq('id', eventData.user_id)
      .single()

    if (profileError) {
  console.error('PROFILE LOAD ERROR:', profileError)
}

    // 🔥 GET TEAM LOGO ONLY (NO OWNER DATA USED)
    const { data: accountData } = await supabase
      .from('accounts')
      .select('team_logo_url')
      .eq('id', propertyData.account_id)
      .single()

    // 🔥 FINAL — NO FALLBACKS, NO MIXING
const agentName = profileData?.full_name || ''
const agentAvatar = profileData?.agent_photo_url || ''
const agentPhone = profileData?.phone || ''

console.log('PROFILE DATA DEBUG:', {
  agentName,
  agentAvatar,
  agentPhone,
})

setBranding({
  name: agentName,
  email: profileData?.email || '',
  avatar: agentAvatar,
  phone: agentPhone,
  team_logo_url: accountData?.team_logo_url || '',
})
  }

  if (eventId) loadData()
}, [eventId])

  const handleSubmit = async () => {
    if (!event || !property) return

    if (!firstName.trim()) {
      alert('First name is required.')
      return
    }

    if (!email.trim()) {
      alert('Email is required.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      alert('Please enter a valid email address.')
      return
    }

    if (event.ask_working_with_realtor && workingWithRealtor === null) {
      alert('Please select whether you are working with a Realtor.')
      return
    }

    try {
      const res = await fetch('/api/open-house', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          property_id: property.id,
          open_house_event_id: event.id,
          wants_feature_sheet: wantsFeatureSheet,
          working_with_realtor: workingWithRealtor,
          realtor_name: realtorName || null,
          hear_about: hearAbout || null,
          hear_about_other: hearAbout === 'Other' ? hearAboutOther : null,
          buyer_stage: buyerStage || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Something went wrong.')
        return
      }

      setSubmitted(true)
    } catch {
      alert('Server error.')
    }
  }

  if (!property || !event) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white p-10 rounded-xl shadow text-center w-full max-w-md">

  {branding && (
  <>
    {branding.avatar && (
      <img
        src={branding.avatar}
        alt="Agent"
        className="mx-auto h-16 w-16 rounded-full object-cover mb-3"
      />
    )}

    <p className="text-lg font-semibold text-gray-900">
  {branding.name || ''}
</p>

    {branding.team_logo_url && (
      <img
        src={branding.team_logo_url}
        alt="Team Logo"
        className="mx-auto h-16 object-contain mt-3 mb-4"
      />
    )}
  </>
)}

  <h1 className="text-2xl font-bold mb-3 mt-2">
    Thank You For Visiting
  </h1>

  <p className="text-gray-600 mb-4">{property.address}</p>

  {branding?.phone && (
  <div className="text-sm text-gray-500 mt-4">
    <div>{branding.phone}</div>
  </div>
)}

</div>
      </div>
    )
  }

  return (
  <div className="min-h-screen bg-gray-100">

    <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 p-10">

      <div>
        <h2 className="text-2xl font-bold mb-4">
          {property.address}
        </h2>

        <p className="text-gray-500 mb-6">
          {new Date(event.event_date).toLocaleDateString()}
        </p>

        {property.image_url && (
          <img
  src={property.image_url}
  className="rounded-xl shadow w-full max-h-[400px] object-cover"
/>
        )}
        {branding && (
  <div className="mt-6 text-center md:text-left">

    <p className="text-xs uppercase tracking-wide text-gray-400 mb-4">
      Presented by
    </p>

    {/* AGENT PHOTO (render even if empty check fails silently) */}
    <div className="flex justify-center md:justify-start mb-2">
      {branding.avatar ? (
        <img
          src={branding.avatar}
          alt="Agent"
          className="h-16 w-16 rounded-full object-cover"
        />
      ) : null}
    </div>

    {/* AGENT NAME (ALWAYS RENDER LINE) */}
    <p className="text-lg font-semibold text-gray-900 mb-4 text-center md:text-left">
      {branding.name || ''}
    </p>

    {/* TEAM LOGO */}
    <div className="flex justify-center md:justify-start mb-3">
      {branding.team_logo_url ? (
        <img
          src={branding.team_logo_url}
          alt="Team Logo"
          className="h-40 object-contain"
        />
      ) : null}
    </div>

    {/* AGENT PHONE */}
    <div className="text-sm text-gray-600 mt-2">
      {branding.phone || ''}
    </div>

  </div>
)}

   
      </div>

      <div className="bg-white p-8 rounded-xl shadow-lg">
        <h3 className="text-xl font-semibold mb-6">
          Open House Sign-In
        </h3>

        <input
          className="w-full mb-4 p-3 border rounded-lg"
          placeholder="First Name *"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />

        <input
          className="w-full mb-4 p-3 border rounded-lg"
          placeholder="Last Name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />

        <input
          className="w-full mb-4 p-3 border rounded-lg"
          placeholder="Email *"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full mb-6 p-3 border rounded-lg"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        {event.ask_buyer_stage && (
          <div className="mb-6">
            <p className="text-sm font-medium mb-2">What stage are you in?</p>
            {['Just Looking', 'Buying Soon', 'Actively Buying', 'Selling Also'].map(option => (
              <label key={option} className="block mb-2">
                <input
                  type="radio"
                  value={option}
                  checked={buyerStage === option}
                  onChange={(e) => setBuyerStage(e.target.value)}
                  className="mr-2"
                />
                {option}
              </label>
            ))}
          </div>
        )}

          {event.ask_working_with_realtor && (
            <div className="mb-6">
              <p className="text-sm font-medium mb-2">
                Are you currently working with a Realtor?
              </p>

              <label className="block mb-2">
                <input
                  type="radio"
                  checked={workingWithRealtor === true}
                  onChange={() => setWorkingWithRealtor(true)}
                  className="mr-2"
                />
                Yes
              </label>

              <label className="block mb-2">
                <input
                  type="radio"
                  checked={workingWithRealtor === false}
                  onChange={() => setWorkingWithRealtor(false)}
                  className="mr-2"
                />
                No
              </label>

              {workingWithRealtor && (
                <input
                  className="w-full mt-3 p-3 border rounded-lg"
                  placeholder="Realtor Name"
                  value={realtorName}
                  onChange={(e) => setRealtorName(e.target.value)}
                />
              )}
            </div>
          )}

          {event.ask_hear_about && (
            <div className="mb-6">
              <p className="text-sm font-medium mb-2">
                How did you hear about this open house?
              </p>

              {['Online', 'Social Media', 'Drive By', 'Referral', 'Email', 'Other'].map(option => (
                <label key={option} className="block mb-2">
                  <input
                    type="radio"
                    value={option}
                    checked={hearAbout === option}
                    onChange={(e) => setHearAbout(e.target.value)}
                    className="mr-2"
                  />
                  {option}
                </label>
              ))}

              {hearAbout === 'Other' && (
                <input
                  className="w-full mt-3 p-3 border rounded-lg"
                  placeholder="Please specify"
                  value={hearAboutOther}
                  onChange={(e) => setHearAboutOther(e.target.value)}
                />
              )}
            </div>
          )}

          <label className="flex items-start gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={wantsFeatureSheet}
              onChange={(e) => setWantsFeatureSheet(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm text-gray-700">
              Email me the feature sheet
            </span>
          </label>

          <button
            onClick={handleSubmit}
            className="w-full bg-black text-white p-3 rounded-lg hover:bg-gray-800 transition"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  )
}
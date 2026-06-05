'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Property = {
  id: string
  address: string
  image_url?: string
}

export default function SqueezePage() {
  const params = useParams()
  const propertyId = params.id as string

  const [property, setProperty] = useState<Property | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [workingWithRealtor, setWorkingWithRealtor] =
    useState<boolean | null>(null)

  const [preApproved, setPreApproved] = useState('')
  const [timeline, setTimeline] = useState('')

  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const loadProperty = async () => {
      const { data } = await supabase
        .from('properties')
        .select('id,address,image_url')
        .eq('id', propertyId)
        .single()

      setProperty(data)
    }

    if (propertyId) {
      loadProperty()
    }
  }, [propertyId])

  const handleSubmit = async () => {
    if (!property) return

    if (!firstName.trim()) {
      alert('First Name is required')
      return
    }

    if (!email.trim()) {
      alert('Email is required')
      return
    }

    const res = await fetch('/api/squeeze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        property_id: property.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        working_with_realtor: workingWithRealtor,
        pre_approved: preApproved,
        timeline,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      alert(data.error || 'Something went wrong')
      return
    }

    setSubmitted(true)
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-10 rounded-xl shadow max-w-md text-center">

          <h1 className="text-3xl font-bold mb-4">
            Feature Sheet Sent
          </h1>

          <p className="text-gray-600">
            Please check your email.
          </p>

        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">

      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 p-10">

        <div>

          <h1 className="text-3xl font-bold mb-4">
            {property.address}
          </h1>

          {property.image_url && (
            <img
              src={property.image_url}
              alt={property.address}
              className="rounded-xl shadow w-full"
            />
          )}

        </div>

        <div className="bg-white p-8 rounded-xl shadow-lg">

          <h2 className="text-2xl font-semibold mb-2">
            Get The Feature Sheet
          </h2>

          <p className="text-gray-500 mb-6">
            Enter your information below and we'll email it to you.
          </p>

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

          <div className="mb-6">
            <p className="font-medium mb-2">
              Working With Realtor?
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

            <label className="block">
              <input
                type="radio"
                checked={workingWithRealtor === false}
                onChange={() => setWorkingWithRealtor(false)}
                className="mr-2"
              />
              No
            </label>
          </div>

          <div className="mb-6">
            <label className="block mb-2 font-medium">
              Pre Approved?
            </label>

            <select
              value={preApproved}
              onChange={(e) => setPreApproved(e.target.value)}
              className="w-full border p-3 rounded-lg"
            >
              <option value="">Select</option>
              <option>Yes</option>
              <option>No</option>
              <option>Working On It</option>
            </select>
          </div>

          <div className="mb-8">
            <label className="block mb-2 font-medium">
              Timeline
            </label>

            <select
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              className="w-full border p-3 rounded-lg"
            >
              <option value="">Select</option>
              <option>Immediately</option>
              <option>0-3 Months</option>
              <option>3-6 Months</option>
              <option>6+ Months</option>
              <option>Just Looking</option>
            </select>
          </div>

          <button
            onClick={handleSubmit}
            className="w-full bg-black text-white p-3 rounded-lg hover:bg-gray-800"
          >
            Send Me The Feature Sheet
          </button>

        </div>

      </div>

    </div>
  )
}
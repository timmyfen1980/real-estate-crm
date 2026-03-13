'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function NewContactPage() {

  const router = useRouter()

  const [contact, setContact] = useState({
    first_name: '',
    last_name: '',
    preferred_name: '',
    email: '',
    secondary_email: '',
    phone: '',
    secondary_phone: '',
    spouse_name: '',
    children_names: '',
    number_of_children: '',
    pet_names: '',
    birthday: '',
    marriage_anniversary: '',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    preferred_contact_method: '',
    best_time_to_contact: '',
    language_preference: '',
    source: '',
    referral_source: '',
    campaign: '',
    lead_capture_method: '',
    instagram: '',
    facebook: '',
    linkedin: '',
    twitter: ''
  })

  const updateField = (field: string, value: any) => {
    setContact(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const createContact = async () => {

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) return

    const { data } = await supabase
      .from('contacts')
      .insert([
        {
          ...contact,
          account_id: membership.account_id,
          assigned_user_id: user.id
        }
      ])
      .select()
      .single()

    if (data) {
      router.push(`/dashboard/contacts/${data.id}`)
    }

  }

  return (

    <div className="min-h-screen bg-gray-50 p-8">

      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-8 space-y-6">

        <div className="flex items-center justify-between">

  <h1 className="text-2xl font-semibold">
    New Contact
  </h1>

  <button
    onClick={createContact}
    className="bg-black text-white px-6 py-3 rounded"
  >
    Create Contact
  </button>

</div>

        {/* BASIC */}

        <div className="grid md:grid-cols-2 gap-4">

          <input
            placeholder="First Name"
            value={contact.first_name}
            onChange={(e)=>updateField('first_name', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Last Name"
            value={contact.last_name}
            onChange={(e)=>updateField('last_name', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Preferred Name"
            value={contact.preferred_name}
            onChange={(e)=>updateField('preferred_name', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Cell Phone"
            value={contact.phone}
            onChange={(e)=>updateField('phone', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Home Phone"
            value={contact.secondary_phone}
            onChange={(e)=>updateField('secondary_phone', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Email"
            value={contact.email}
            onChange={(e)=>updateField('email', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Secondary Email"
            value={contact.secondary_email}
            onChange={(e)=>updateField('secondary_email', e.target.value)}
            className="border rounded p-2"
          />

        </div>

        {/* PERSONAL */}

        <div className="grid md:grid-cols-2 gap-4">

          <input
            placeholder="Spouse Name"
            value={contact.spouse_name}
            onChange={(e)=>updateField('spouse_name', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Children Names"
            value={contact.children_names}
            onChange={(e)=>updateField('children_names', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Number of Children"
            type="number"
            value={contact.number_of_children}
            onChange={(e)=>updateField('number_of_children', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Pet Names"
            value={contact.pet_names}
            onChange={(e)=>updateField('pet_names', e.target.value)}
            className="border rounded p-2"
          />

          <input
            type="date"
            value={contact.birthday}
            onChange={(e)=>updateField('birthday', e.target.value)}
            className="border rounded p-2"
          />

          <input
            type="date"
            value={contact.marriage_anniversary}
            onChange={(e)=>updateField('marriage_anniversary', e.target.value)}
            className="border rounded p-2"
          />

        </div>

        {/* ADDRESS */}

        <div className="grid md:grid-cols-2 gap-4">

          <input
            placeholder="Address"
            value={contact.address}
            onChange={(e)=>updateField('address', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="City"
            value={contact.city}
            onChange={(e)=>updateField('city', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Province"
            value={contact.province}
            onChange={(e)=>updateField('province', e.target.value)}
            className="border rounded p-2"
          />

          <input
            placeholder="Postal Code"
            value={contact.postal_code}
            onChange={(e)=>updateField('postal_code', e.target.value)}
            className="border rounded p-2"
          />
{/* COMMUNICATION */}

<input
  placeholder="Preferred Contact Method"
  value={contact.preferred_contact_method}
  onChange={(e)=>updateField('preferred_contact_method', e.target.value)}
  className="border rounded p-2"
/>

<input
  placeholder="Best Time To Contact"
  value={contact.best_time_to_contact}
  onChange={(e)=>updateField('best_time_to_contact', e.target.value)}
  className="border rounded p-2"
/>

<input
  placeholder="Language Preference"
  value={contact.language_preference}
  onChange={(e)=>updateField('language_preference', e.target.value)}
  className="border rounded p-2"
/>

{/* CRM SOURCE */}

<input
  placeholder="Source"
  value={contact.source}
  onChange={(e)=>updateField('source', e.target.value)}
  className="border rounded p-2"
/>

<input
  placeholder="Referral Source"
  value={contact.referral_source}
  onChange={(e)=>updateField('referral_source', e.target.value)}
  className="border rounded p-2"
/>

<input
  placeholder="Campaign"
  value={contact.campaign}
  onChange={(e)=>updateField('campaign', e.target.value)}
  className="border rounded p-2"
/>

<input
  placeholder="Lead Capture Method"
  value={contact.lead_capture_method}
  onChange={(e)=>updateField('lead_capture_method', e.target.value)}
  className="border rounded p-2"
/>

{/* SOCIAL */}

<input
  placeholder="Instagram"
  value={contact.instagram}
  onChange={(e)=>updateField('instagram', e.target.value)}
  className="border rounded p-2"
/>

<input
  placeholder="Facebook"
  value={contact.facebook}
  onChange={(e)=>updateField('facebook', e.target.value)}
  className="border rounded p-2"
/>

<input
  placeholder="LinkedIn"
  value={contact.linkedin}
  onChange={(e)=>updateField('linkedin', e.target.value)}
  className="border rounded p-2"
/>

<input
  placeholder="Twitter"
  value={contact.twitter}
  onChange={(e)=>updateField('twitter', e.target.value)}
  className="border rounded p-2"
/>

</div>

<button
  onClick={createContact}
  className="bg-black text-white px-6 py-3 rounded"
>
  Create Contact
</button>

</div>

</div>

)
}
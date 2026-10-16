'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function NewContactPage() {

  const router = useRouter()

  const [extractingId, setExtractingId] = useState(false)
  const [idExtractError, setIdExtractError] = useState('')

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

    const { data, error } = await supabase
  .from('contacts')
  .insert([
  {
    ...contact,

    number_of_children:
      contact.number_of_children !== ''
        ? Number(contact.number_of_children)
        : null,

    birthday: contact.birthday !== '' ? contact.birthday : null,
    marriage_anniversary:
      contact.marriage_anniversary !== ''
        ? contact.marriage_anniversary
        : null,

    account_id: membership.account_id,
    assigned_user_id: user.id
  }
])
  .select()
  .single()

if (error) {
  console.error('CREATE CONTACT ERROR:', error)
  alert(error.message)
  return
}

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
      <div className="mt-4">
        <label className="cursor-pointer inline-block text-sm px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium border border-blue-200">
          {extractingId ? 'Reading ID…' : 'Upload Driver\'s Licence to Auto-Fill'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={extractingId}
            onChange={async (e) => {
              const files = e.target.files;
              if (!files || files.length === 0) return;
              setExtractingId(true);
              setIdExtractError('');
              try {
                const formData = new FormData();
                formData.append('file', files[0]);
                const res = await fetch('/api/extract-id', {
                  method: 'POST',
                  body: formData,
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Extraction failed');
                const ext = data.extracted;
                const updates: any = {};
                if (ext.first_name) updates.first_name = ext.first_name;
                if (ext.last_name) updates.last_name = ext.last_name;
                if (ext.date_of_birth) updates.birthday = ext.date_of_birth;
                if (ext.address) updates.address = ext.address;
                if (ext.city) updates.city = ext.city;
                if (ext.province) updates.province = ext.province;
                if (ext.postal_code) updates.postal_code = ext.postal_code;
                setContact(prev => ({ ...prev, ...updates }));
              } catch (err: any) {
                setIdExtractError(err.message || 'Failed to read ID.');
              } finally {
                setExtractingId(false);
                e.target.value = '';
              }
            }}
          />
        </label>
        {idExtractError && (
          <p className="text-xs text-red-600 mt-2">{idExtractError}</p>
        )}
        <p className="text-xs text-gray-500 mt-2">
          Upload a driver's licence photo to automatically fill name, address, and birthday.
        </p>
      </div>

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
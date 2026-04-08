'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function NewPropertyPage() {
  const router = useRouter()

  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [status, setStatus] = useState('coming_soon')
  const [imageFile, setImageFile] = useState<File | null>(null)

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) return

    const { data: property } = await supabase
      .from('properties')
      .insert({
        address,
        city,
        status,
        user_id: user.id,
        account_id: membership.account_id,
      })
      .select()
      .single()

    if (imageFile && property) {

      const imagePath = `${membership.account_id}/${property.id}/image.${imageFile.name.split('.').pop()}`

      await supabase.storage
        .from('property-images')
        .upload(imagePath, imageFile, { upsert: true })

      const { data } = supabase.storage
        .from('property-images')
        .getPublicUrl(imagePath)

      await supabase
        .from('properties')
        .update({ image_url: data.publicUrl })
        .eq('id', property.id)
    }

    router.push('/dashboard/properties')
  }

  return (
    <div className="min-h-screen bg-gray-100 p-10 flex justify-center">

      <div className="bg-white w-full max-w-2xl rounded-xl shadow p-10 space-y-8">

        <h1 className="text-2xl font-semibold">
          Add Property
        </h1>

        <div>

          <label className="text-sm font-medium block mb-2">
            Address
          </label>

          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full border rounded-md p-3"
          />

        </div>

        <div>

          <label className="text-sm font-medium block mb-2">
            City
          </label>

          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full border rounded-md p-3"
          />

        </div>

        <div>

          <label className="text-sm font-medium block mb-2">
            Status
          </label>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full border rounded-md p-3"
          >
            <option value="coming_soon">Coming Soon</option>

<option value="for_sale">For Sale</option>
<option value="sold">Sold</option>

<option value="for_lease">For Lease</option>
<option value="leased">Leased</option>

<option value="closed">Closed</option>
          </select>

        </div>

        <div>

          <label className="text-sm font-medium block mb-3">
            Property Image
          </label>

          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              e.target.files && setImageFile(e.target.files[0])
            }
          />

        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-black text-white py-3 rounded-md hover:bg-gray-800 transition"
        >
          {saving ? 'Saving...' : 'Create Property'}
        </button>

      </div>

    </div>
  )
}
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function NewPropertyPage() {
  const router = useRouter()

  const [address, setAddress] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!address) return

    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      alert('Not authenticated')
      setLoading(false)
      return
    }

    let imageUrl: string | null = null

    if (imageFile) {
      const filePath = `${user.id}/${Date.now()}-${imageFile.name}`

      const { error: uploadError } = await supabase.storage
        .from('property-images')
        .upload(filePath, imageFile)

      if (uploadError) {
        alert(uploadError.message)
        setLoading(false)
        return
      }

      const { data } = supabase.storage
        .from('property-images')
        .getPublicUrl(filePath)

      imageUrl = data.publicUrl
    }

    const res = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        image_url: imageUrl,
        user_id: user.id,
      }),
    })

    const result = await res.json()

    if (res.ok) {
      router.push(`/open-house/${result.property.id}`)
    } else {
      alert(result.error)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex justify-center items-center bg-gray-100 p-6">
      <div className="bg-white p-6 rounded shadow w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-6 text-center">
          Add Property
        </h1>

        <input
          className="w-full mb-4 p-2 border rounded"
          placeholder="Property Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <input
          type="file"
          accept="image/*"
          className="w-full mb-6"
          onChange={(e) => {
            if (e.target.files) {
              setImageFile(e.target.files[0])
            }
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-black text-white p-3 rounded"
        >
          {loading ? 'Creating...' : 'Create Property'}
        </button>
      </div>
    </div>
  )
}
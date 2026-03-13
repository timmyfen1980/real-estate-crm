'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Property = {
  id: string
  address: string
  city: string | null
  status: string
  image_url: string | null
}

export default function PropertiesPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [accountId, setAccountId] = useState<string | null>(null)

  const loadProperties = async () => {
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

    setAccountId(membership.account_id)

    const { data } = await supabase
      .from('properties')
      .select('id,address,city,status,image_url')
      .eq('account_id', membership.account_id)
      .order('created_at', { ascending: false })

    if (data) {
      setProperties(data)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadProperties()
  }, [])

  const renderSection = (title: string, status: string) => {
    const list = properties.filter(p => p.status === status)

    return (
      <div className="mb-12">

        <h2 className="text-lg font-semibold mb-4 uppercase text-gray-500">
          {title}
        </h2>

        {list.length === 0 && (
          <div className="text-sm text-gray-400 mb-4">
            No properties yet
          </div>
        )}

        <div className="grid grid-cols-4 gap-6">

          {list.map(property => (
            <div
              key={property.id}
              onClick={() => router.push(`/dashboard/properties/${property.id}`)}
              className="cursor-pointer bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition"
            >

              <div className="h-40 bg-gray-100">
                {property.image_url ? (
                  <img
                    src={property.image_url}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    No Image
                  </div>
                )}
              </div>

              <div className="p-4">

                <div className="font-medium text-sm mb-1">
                  {property.address}
                </div>

                <div className="text-xs text-gray-500">
                  {property.city || ''}
                </div>

              </div>

            </div>
          ))}

        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-10">
        Loading properties...
      </div>
    )
  }

  return (
    <div className="p-10">

      <div className="flex justify-between items-center mb-10">

        <h1 className="text-2xl font-semibold">
          Properties
        </h1>

        <button
          onClick={() => router.push('/dashboard/properties/new')}
          className="bg-black text-white px-5 py-2 rounded-md hover:bg-gray-800 transition"
        >
          + Add Property
        </button>

      </div>

      {renderSection('Coming Soon', 'coming_soon')}

      {renderSection('For Sale', 'for_sale')}

      {renderSection('Sold', 'sold')}

      {renderSection('Closed', 'closed')}

    </div>
  )
}
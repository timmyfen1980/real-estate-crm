'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Lead = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  status: string
  created_at: string
}

type Property = {
  id: string
  address: string
}

type Event = {
  id: string
  property_id: string
  event_date: string
}

export default function EventLeadsPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [leads, setLeads] = useState<Lead[]>([])
  const [property, setProperty] = useState<Property | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    const { data: eventData } = await supabase
      .from('open_house_events')
      .select('id, property_id, event_date')
      .eq('id', eventId)
      .single()

    if (!eventData) {
      router.push('/dashboard/open-houses')
      return
    }

    setEvent(eventData)

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, address')
      .eq('id', eventData.property_id)
      .single()

    setProperty(propertyData || null)

    const { data: leadData } = await supabase
      .from('leads')
      .select('*')
      .eq('open_house_event_id', eventId)
      .order('created_at', { ascending: false })

    setLeads(leadData || [])
    setLoading(false)
  }

  useEffect(() => {
    if (eventId) loadData()
  }, [eventId])

  const updateStatus = async (leadId: string, status: string) => {
    await supabase
      .from('leads')
      .update({ status })
      .eq('id', leadId)

    setLeads(prev =>
      prev.map(l =>
        l.id === leadId ? { ...l, status } : l
      )
    )
  }

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'Hot':
        return 'bg-red-100 text-red-700 border-red-200'
      case 'Contacted':
        return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'Cold':
        return 'bg-gray-100 text-gray-600 border-gray-200'
      case 'Closed':
        return 'bg-green-100 text-green-700 border-green-200'
      default:
        return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    }
  }

  const total = leads.length
  const hotCount = leads.filter(l => l.status === 'Hot').length
  const newCount = leads.filter(l => l.status === 'New').length
  const contactedCount = leads.filter(l => l.status === 'Contacted').length

  if (loading || !event || !property) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-10">

      <div className="max-w-6xl mx-auto">

        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold">
              Open House Leads
            </h1>
            <p className="text-gray-500 mt-1">
              {property.address} · {new Date(event.event_date).toLocaleDateString()}
            </p>
          </div>

          <div className="text-right text-sm">
            <div className="font-semibold">{total} Total</div>
            <div className="text-red-600">{hotCount} Hot</div>
            <div>{newCount} New</div>
            <div>{contactedCount} Contacted</div>

            <button
              onClick={() => router.push('/dashboard/open-houses')}
              className="underline mt-2 block"
            >
              Back to Open Houses
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden">

          {leads.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No leads collected yet.
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="border-b bg-gray-50 text-sm">
                <tr>
                  <th className="p-4">Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`border-b cursor-pointer hover:bg-gray-50 ${
                      lead.status === 'Hot' ? 'bg-red-50' : ''
                    }`}
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                  >
                    <td className="p-4 font-medium">
                      {lead.first_name} {lead.last_name}
                    </td>
                    <td>{lead.email}</td>
                    <td>{lead.phone}</td>
                    <td>
                      <select
                        value={lead.status || 'New'}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateStatus(lead.id, e.target.value)
                        }
                        className={`border rounded px-2 py-1 text-sm ${getStatusStyles(
                          lead.status || 'New'
                        )}`}
                      >
                        <option>New</option>
                        <option>Contacted</option>
                        <option>Hot</option>
                        <option>Cold</option>
                        <option>Closed</option>
                      </select>
                    </td>
                    <td className="text-sm text-gray-500">
                      {new Date(lead.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        </div>
      </div>
    </div>
  )
}
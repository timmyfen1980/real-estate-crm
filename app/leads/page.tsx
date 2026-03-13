'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Lead = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  status: string
}

export default function LeadsPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    loadLeads()
  }, [])

  const loadLeads = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      router.push('/')
      return
    }

    // Get account_id from account_users
    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
      .single()

    if (!membership) {
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('account_id', membership.account_id)
      .order('created_at', { ascending: false })

    setLeads(data || [])
    setLoading(false)
  }

  const addLead = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
      .single()

    if (!membership) return

    await supabase.from('leads').insert([
      {
        account_id: membership.account_id,
        user_id: userData.user.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
      },
    ])

    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    loadLeads()
  }

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <h1 className="text-2xl font-bold mb-6">Leads</h1>

      <div className="bg-white p-6 rounded shadow mb-8">
        <h2 className="font-semibold mb-4">Add New Lead</h2>

        <div className="grid grid-cols-4 gap-4">
          <input
            className="border p-2 rounded"
            placeholder="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            className="border p-2 rounded"
            placeholder="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <input
            className="border p-2 rounded"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="border p-2 rounded"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <button
          onClick={addLead}
          className="mt-4 bg-black text-white px-4 py-2 rounded"
        >
          Add Lead
        </button>
      </div>

      <div className="bg-white p-6 rounded shadow">
        {loading ? (
          <p>Loading...</p>
        ) : leads.length === 0 ? (
          <p>No leads yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="pb-2">Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/leads/${lead.id}`)}
                >
                  <td className="py-2">
                    {lead.first_name} {lead.last_name}
                  </td>
                  <td>{lead.email}</td>
                  <td>{lead.phone}</td>
                  <td>{lead.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
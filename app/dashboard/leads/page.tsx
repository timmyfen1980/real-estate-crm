'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'

type Lead = {
  id: string
  first_name: string
  last_name: string
  email?: string
  status: string
  deal_type: string | null
  created_at: string
  property_id: string
  assigned_user_id: string
}


export default function LeadsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [leads, setLeads] = useState<Lead[]>([])
  const [properties, setProperties] = useState<Record<string, string>>({})
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

const [newLead, setNewLead] = useState({
  first_name: '',
  last_name: '',
  email: '',
  assigned_user_id: '',
})

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')
  const [dealTypeFilter, setDealTypeFilter] = useState('')

  // Pagination
  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

  const loadData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/')
      return
    }

    const { data: membership } = await supabase
      .from('account_users')
    .select('account_id, role')      .eq('user_id', user.id)
      .single()

    if (!membership) return

    let query = supabase
  .from('leads')
  .select('*')
  .eq('account_id', membership.account_id)

if (membership.role !== 'owner') {
  query = query.eq('assigned_user_id', user.id)
}

const { data: leadData } = await query.order('created_at', {
  ascending: false,
})

    const leadsList = leadData || []
    setLeads(leadsList)


    const propertyIds = [...new Set(leadsList.map(l => l.property_id))]
    if (propertyIds.length > 0) {
      const { data: propertyData } = await supabase
        .from('properties')
        .select('id, address')
        .in('id', propertyIds)

      const propertyMap: Record<string, string> = {}
      propertyData?.forEach(p => {
        propertyMap[p.id] = p.address
      })

      setProperties(propertyMap)
    }

    const assignedIds = [
      ...new Set(
        leadsList.map(l => l.assigned_user_id).filter(Boolean)
      ),
    ] as string[]

    if (assignedIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', assignedIds)

      const profileMap: Record<string, string> = {}
      profileData?.forEach(p => {
        profileMap[p.id] = p.full_name
      })

      setProfiles(profileMap)
    }

    const leadIds = leadsList.map(l => l.id)
    if (leadIds.length > 0) {
      const { data: attendanceData } = await supabase
        .from('open_house_attendances')
        .select('lead_id')
        .in('lead_id', leadIds)

      const countMap: Record<string, number> = {}
      attendanceData?.forEach(a => {
        countMap[a.lead_id] = (countMap[a.lead_id] || 0) + 1
      })

      setAttendanceCounts(countMap)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])
useEffect(() => {
  const status = searchParams.get('status')
  const deal = searchParams.get('deal')

  if (status) setStatusFilter(status)
  if (deal) setDealTypeFilter(deal)
}, [searchParams])
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const fullName = `${lead.first_name} ${lead.last_name}`.toLowerCase()
      const email = (lead.email || '').toLowerCase()

      return (
        (!search || fullName.includes(search.toLowerCase()) || email.includes(search.toLowerCase())) &&
        (!statusFilter || lead.status === statusFilter) &&
        (!assignedFilter || lead.assigned_user_id === assignedFilter) &&
        (!dealTypeFilter || lead.deal_type === dealTypeFilter)
      )
    })
  }, [leads, search, statusFilter, assignedFilter, dealTypeFilter])

  const totalPages = Math.ceil(filteredLeads.length / pageSize)

  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredLeads.slice(start, start + pageSize)
  }, [filteredLeads, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, assignedFilter, dealTypeFilter, pageSize])

 
 
const createLead = async () => {
  if (!newLead.first_name || !newLead.last_name || !newLead.email) {
    alert('First name, last name, and email are required.')
    return
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data: membership } = await supabase
    .from('account_users')
    .select('account_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) return

  const accountId = membership.account_id
  const normalizedEmail = newLead.email.toLowerCase().trim()

  // =========================
  // CHECK IF LEAD EXISTS
  // =========================
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('account_id', accountId)
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingLead) {
    alert('A lead with this email already exists.')
    return
  }

  // =========================
  // ENSURE CONTACT EXISTS
  // =========================
  let contactId: string

  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('account_id', accountId)
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingContact) {
    contactId = existingContact.id
  } else {
    const { data: newContact, error: contactError } =
      await supabase
        .from('contacts')
        .insert([
          {
            account_id: accountId,
            created_by: user.id,
            assigned_user_id:
              newLead.assigned_user_id || user.id,
            first_name: newLead.first_name,
            last_name: newLead.last_name,
            email: normalizedEmail,
            lifecycle_stage: 'New',
            source: 'Manual Entry',
            original_source: 'Manual Entry',
          },
        ])
        .select('id')
        .single()

    if (contactError || !newContact) {
      alert(contactError?.message || 'Contact creation failed.')
      return
    }

    contactId = newContact.id
  }

  // =========================
  // CREATE LEAD LINKED TO CONTACT
  // =========================
  const { error: leadError } = await supabase
    .from('leads')
    .insert([
      {
        account_id: accountId,
        contact_id: contactId,
        user_id: user.id,
        assigned_user_id:
          newLead.assigned_user_id || user.id,
        first_name: newLead.first_name,
        last_name: newLead.last_name,
        email: normalizedEmail,
        status: 'New',
        created_at: new Date().toISOString(),
        source: 'Manual Entry',
         property_id: null,
      },
    ])

  if (leadError) {
    alert(leadError.message || 'Lead creation failed.')
    return
  }

  setShowModal(false)
  setNewLead({
    first_name: '',
    last_name: '',
    email: '',
    assigned_user_id: '',
  })

  loadData()
}
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    )
  }

  const uniqueStatuses = [...new Set(leads.map(l => l.status))]
  const uniqueDealTypes = [...new Set(leads.map(l => l.deal_type).filter(Boolean))]
  const uniqueAssigned = [...new Set(leads.map(l => l.assigned_user_id))] as string[]

  return (
    <div className="min-h-screen bg-gray-50 p-10">
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow overflow-hidden">

        <div className="p-8 border-b space-y-6">
  <div className="flex justify-between items-center">
    <h1 className="text-2xl font-semibold">All Leads</h1>

    <button
      onClick={() => setShowModal(true)}
      className="px-4 py-2 bg-black text-white rounded"
    >
      + New Lead
    </button>
  </div>


          {/* Filters */}
          <div className="grid md:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded-lg px-4 py-2"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-lg px-4 py-2"
            >
              <option value="">All Status</option>
              {uniqueStatuses.map(status => (
                <option key={status}>{status}</option>
              ))}
            </select>

            <select
              value={assignedFilter}
              onChange={(e) => setAssignedFilter(e.target.value)}
              className="border rounded-lg px-4 py-2"
            >
              <option value="">All Assigned</option>
              {uniqueAssigned.map(id => (
                <option key={id} value={id}>
                  {profiles[id] || 'Unknown'}
                </option>
              ))}
            </select>

            <select
              value={dealTypeFilter}
              onChange={(e) => setDealTypeFilter(e.target.value)}
              className="border rounded-lg px-4 py-2"
            >
              <option value="">All Deal Types</option>
              {uniqueDealTypes.map(type => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-between items-center">
            <div>
              Showing {filteredLeads.length} leads
            </div>

            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border rounded-lg px-3 py-2"
            >
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>
        </div>

        {paginatedLeads.length === 0 ? (
          <div className="p-8 text-gray-500">
            No leads match your filters.
          </div>
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-4 font-medium">Name</th>
                  <th>Status</th>
                  <th>Deal</th>
                  <th>Property</th>
                  <th>Visits</th>
                  <th>Assigned</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLeads.map(lead => (
                  <tr
                    key={lead.id}
                    className="border-b hover:bg-gray-50 cursor-pointer transition"
                    onClick={() =>
                      router.push(`/dashboard/leads/${lead.id}`)
                    }
                  >
                    <td className="p-4 font-medium">
                      {lead.first_name} {lead.last_name}
                    </td>

                    <td>
                      <StatusBadge status={lead.status} />
                    </td>

                    <td className="capitalize text-gray-700">
                      {lead.deal_type || '-'}
                    </td>

                    <td>
                      {properties[lead.property_id] || '-'}
                    </td>

                    <td>
                      <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                        {attendanceCounts[lead.id] || 0}
                      </span>
                    </td>

                    <td>
                      {profiles[lead.assigned_user_id] || 'Unknown'}
                    </td>

                    <td className="text-gray-500">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-center gap-4 p-6">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="px-4 py-2 border rounded disabled:opacity-40"
              >
                Previous
              </button>

              <span>
                Page {currentPage} of {totalPages || 1}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-4 py-2 border rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
      {showModal && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-lg w-full max-w-md space-y-4">
      <h2 className="text-xl font-semibold">New Lead</h2>

      <input
        type="text"
        placeholder="First Name"
        value={newLead.first_name}
        onChange={(e) =>
          setNewLead({ ...newLead, first_name: e.target.value })
        }
        className="w-full border p-2 rounded"
      />

      <input
        type="text"
        placeholder="Last Name"
        value={newLead.last_name}
        onChange={(e) =>
          setNewLead({ ...newLead, last_name: e.target.value })
        }
        className="w-full border p-2 rounded"
      />

      <input
        type="email"
        placeholder="Email"
        value={newLead.email}
        onChange={(e) =>
          setNewLead({ ...newLead, email: e.target.value })
        }
        className="w-full border p-2 rounded"
      />

      <div className="flex justify-between">
        <button
          onClick={() => setShowModal(false)}
          className="px-4 py-2 border rounded"
        >
          Cancel
        </button>

        <button
          onClick={createLead}
          className="px-4 py-2 bg-black text-white rounded"
        >
          Create Lead
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    New: 'bg-blue-100 text-blue-700',
    Contacted: 'bg-yellow-100 text-yellow-700',
    Hot: 'bg-red-100 text-red-700',
    Cold: 'bg-gray-200 text-gray-600',
    Closed: 'bg-green-100 text-green-700',
    Lost: 'bg-black text-white',
  }

  return (
    <span
      className={`px-3 py-1 text-xs rounded-full font-medium ${
        colorMap[status] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {status}
    </span>
  )
}
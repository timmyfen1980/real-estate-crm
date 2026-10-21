'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'
import FollowUpModal from '@/app/components/FollowUpModal'

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
  contact_id?: string | null
  next_followup_date?: string | null
  last_contacted_at?: string | null
}

type DripInfo = {
  campaign_name: string
  current_step: number
  total_steps: number | null
  next_send_at: string | null
}


export default function LeadsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [leads, setLeads] = useState<Lead[]>([])
  const [properties, setProperties] = useState<Record<string, string>>({})
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({})
  const [dripByContact, setDripByContact] = useState<Record<string, DripInfo>>({})
  const [activeTab, setActiveTab] = useState<'attention' | 'working' | 'nurturing' | 'clients' | 'archived' | 'all'>('attention')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [followUpLeadId, setFollowUpLeadId] = useState<string | null>(null)

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

    // Active email drip enrollments for these leads' contacts, so the
    // list can show who is being nurtured automatically (and on what).
    const contactIds = [
      ...new Set(leadsList.map(l => l.contact_id).filter(Boolean)),
    ] as string[]
    if (contactIds.length > 0) {
      const { data: enrollData } = await supabase
        .from('contact_campaigns')
        .select('contact_id, campaign_id, current_step, next_send_at')
        .in('contact_id', contactIds)
        .eq('status', 'active')

      if (enrollData && enrollData.length > 0) {
        const campaignIds = [...new Set(enrollData.map(e => e.campaign_id))]
        const { data: campaignData } = await supabase
          .from('email_campaigns')
          .select('id, name')
          .in('id', campaignIds)

        const campaignNames: Record<string, string> = {}
        campaignData?.forEach(c => {
          campaignNames[c.id] = c.name
        })

        const { data: seqData } = await supabase
          .from('email_sequences')
          .select('campaign_id, step_number')
          .in('campaign_id', campaignIds)

        const totals: Record<string, number> = {}
        seqData?.forEach(s => {
          totals[s.campaign_id] = Math.max(totals[s.campaign_id] || 0, s.step_number)
        })

        const dripMap: Record<string, DripInfo> = {}
        enrollData.forEach(e => {
          if (!dripMap[e.contact_id]) {
            dripMap[e.contact_id] = {
              campaign_name: campaignNames[e.campaign_id] || 'Email drip',
              current_step: e.current_step || 0,
              total_steps: totals[e.campaign_id] || null,
              next_send_at: e.next_send_at || null,
            }
          }
        })
        setDripByContact(dripMap)
      } else {
        setDripByContact({})
      }
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
  // ---- Categories + next-step recommendations ----
  const torontoToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const get = (t: string) => parts.find(p => p.type === t)?.value || ''
    return `${get('year')}-${get('month')}-${get('day')}`
  }
  const TODAY = torontoToday()

  const daysSince = (iso: string | null | undefined) => {
    if (!iso) return null
    const then = new Date(String(iso).slice(0, 10) + 'T12:00:00').getTime()
    const now = new Date(TODAY + 'T12:00:00').getTime()
    return Math.floor((now - then) / 86400000)
  }

  const needsAttention = (lead: Lead) => {
    if (['Client', 'Closed', 'Lost'].includes(lead.status)) return false
    if (lead.status === 'New') return true
    if (lead.next_followup_date) {
      return lead.next_followup_date.slice(0, 10) <= TODAY
    }
    const age = daysSince(lead.created_at)
    return age !== null && age > 14
  }

  const categoryOf = (lead: Lead): string => {
    if (lead.status === 'Lost') return 'archived'
    if (lead.status === 'Client' || lead.status === 'Closed') return 'clients'
    if (needsAttention(lead)) return 'attention'
    if (lead.contact_id && dripByContact[lead.contact_id]) return 'nurturing'
    return 'working'
  }

  const fmtDay = (d: string) =>
    new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
    })

  const nextStepFor = (lead: Lead): string => {
    const drip = lead.contact_id ? dripByContact[lead.contact_id] : null
    if (lead.status === 'Client' || lead.status === 'Closed') {
      return 'Client — managed in Deals'
    }
    if (lead.status === 'Lost') return '—'
    if (lead.next_followup_date && lead.next_followup_date.slice(0, 10) < TODAY) {
      return `Follow-up overdue — was due ${fmtDay(lead.next_followup_date)}`
    }
    if (lead.next_followup_date && lead.next_followup_date.slice(0, 10) === TODAY) {
      return 'Follow up today'
    }
    if (lead.status === 'New') return 'Send intro — first touch due'
    const since = daysSince(lead.last_contacted_at || lead.created_at)
    if (drip && since !== null && since > 60) {
      return `Personal check-in due — on ${drip.campaign_name} drip, no contact in ${since}d`
    }
    if (drip) {
      return `On ${drip.campaign_name} drip · Step ${drip.current_step}${
        drip.total_steps ? ' of ' + drip.total_steps : ''
      }${drip.next_send_at ? ' · next ' + fmtDay(drip.next_send_at) : ''}`
    }
    if (!lead.next_followup_date) {
      return since !== null && since > 14
        ? `No follow-up set — last contact ${since}d ago`
        : 'Set a follow-up date'
    }
    return `Follow-up ${fmtDay(lead.next_followup_date)}`
  }

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      attention: 0,
      working: 0,
      nurturing: 0,
      clients: 0,
      archived: 0,
      all: leads.length,
    }
    leads.forEach(l => {
      const c = categoryOf(l)
      counts[c] = (counts[c] || 0) + 1
    })
    return counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, dripByContact])

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const fullName = `${lead.first_name} ${lead.last_name}`.toLowerCase()
      const email = (lead.email || '').toLowerCase()

      return (
        (activeTab === 'all' || categoryOf(lead) === activeTab) &&
        (!search || fullName.includes(search.toLowerCase()) || email.includes(search.toLowerCase())) &&
        (!statusFilter || lead.status === statusFilter) &&
        (!assignedFilter || lead.assigned_user_id === assignedFilter) &&
        (!dealTypeFilter || lead.deal_type === dealTypeFilter)
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, search, statusFilter, assignedFilter, dealTypeFilter, activeTab, dripByContact])

  const totalPages = Math.ceil(filteredLeads.length / pageSize)

  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredLeads.slice(start, start + pageSize)
  }, [filteredLeads, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, assignedFilter, dealTypeFilter, pageSize, activeTab])

 
 
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
    <h1 className="text-2xl font-semibold">Leads</h1>

    <button
      onClick={() => setShowModal(true)}
      className="px-4 py-2 bg-black text-white rounded"
    >
      + New Lead
    </button>
  </div>


          {/* Category tabs */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['attention', 'Needs Attention'],
                ['working', 'Working'],
                ['nurturing', 'Nurturing'],
                ['clients', 'Clients'],
                ['archived', 'Archived'],
                ['all', 'All'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  activeTab === key
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}{' '}
                <span className={activeTab === key ? 'text-gray-300' : 'text-gray-400'}>
                  {categoryCounts[key] || 0}
                </span>
              </button>
            ))}
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
                  <th>Next Step</th>
                  <th>Deal</th>
                  <th>Property</th>
                  <th>Visits</th>
                  <th>Assigned</th>
                  <th>Date</th>
                  <th></th>
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
                      {lead.contact_id && dripByContact[lead.contact_id] && (
                        <span className="ml-2 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium whitespace-nowrap">
                          📧 {dripByContact[lead.contact_id].campaign_name} · Step{' '}
                          {dripByContact[lead.contact_id].current_step}
                          {dripByContact[lead.contact_id].total_steps
                            ? ` of ${dripByContact[lead.contact_id].total_steps}`
                            : ''}
                        </span>
                      )}
                    </td>

                    <td>
                      <StatusBadge status={lead.status} />
                    </td>

                    <td className="text-gray-600 pr-4">
                      {nextStepFor(lead)}
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

                    <td className="pr-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setFollowUpLeadId(lead.id)
                        }}
                        className="px-3 py-1.5 bg-[#0f2a44] text-white text-xs rounded-lg hover:opacity-90 whitespace-nowrap"
                      >
                        ✉ Follow up
                      </button>
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
      {followUpLeadId && (
        <FollowUpModal
          leadId={followUpLeadId}
          onClose={() => setFollowUpLeadId(null)}
          onSent={() => {
            setFollowUpLeadId(null)
            loadData()
          }}
        />
      )}
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
    Client: 'bg-emerald-100 text-emerald-700',
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
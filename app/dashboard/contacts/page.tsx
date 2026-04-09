'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  email: string | null
  phone: string | null
  lifecycle_stage: string | null
  assigned_user_id: string
  birthday: string | null
  home_purchase_date: string | null
  tags: string[] | null
  created_at: string
}

type SavedView = {
  id: string
  name: string
  search: string | null
  lifecycle_filter: string | null
  assigned_filter: string | null
  tag_filter: string | null
}

const LIFECYCLE_OPTIONS = [
  'New',
  'Prospect',
  'Active Buyer',
  'Active Seller',
  'Past Client',
  'Sphere',
  'Do Not Contact'
]

export default function ContactsPage() {
  const router = useRouter()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [lifecycleFilter, setLifecycleFilter] = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')

  const [pageSize, setPageSize] = useState(25)
  const [currentPage, setCurrentPage] = useState(1)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isOwner, setIsOwner] = useState(false)

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/')
      return
    }

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id, role')
      .eq('user_id', user.id)
      .single()

    if (!membership) return

    setIsOwner(membership.role === 'owner')

    let contactQuery = supabase
  .from('contacts')
  .select('*')
  .eq('account_id', membership.account_id)
  .eq('is_deleted', false)
if (membership.role !== 'owner') {
  contactQuery = contactQuery.eq('assigned_user_id', user.id)
}

const { data: contactData } = await contactQuery
  .order('created_at', { ascending: false })

    

   
    const { data: views } = await supabase
      .from('saved_contact_views')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setSavedViews(views || [])

// ALWAYS set contacts immediately (independent of profiles)
setContacts(contactData || [])

// LOAD TEAM PROFILES (independent)
const ids = Array.from(
  new Set((contactData || []).map(c => c.assigned_user_id).filter(Boolean))
)

if (ids.length > 0) {
  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', ids)

  const map: Record<string, string> = {}

  profileData?.forEach(p => {
    map[p.id] = p.full_name
  })

  setProfiles(map)
}
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      const fullName = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase()
      const email = (c.email || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()

      const matchesSearch =
        fullName.includes(search.toLowerCase()) ||
        email.includes(search.toLowerCase()) ||
        phone.includes(search.toLowerCase())

      const matchesLifecycle =
        !lifecycleFilter || c.lifecycle_stage === lifecycleFilter

      const matchesAssigned =
        !assignedFilter || c.assigned_user_id === assignedFilter

      const matchesTag =
        !tagFilter || (c.tags && c.tags.includes(tagFilter))

      return matchesSearch && matchesLifecycle && matchesAssigned && matchesTag
    })
  }, [contacts, search, lifecycleFilter, assignedFilter, tagFilter])

  const totalPages = Math.ceil(filtered.length / pageSize)

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, lifecycleFilter, assignedFilter, tagFilter, pageSize])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    )
  }

  const bulkLifecycleUpdate = async (stage: string) => {
    if (!selectedIds.length) return
    await supabase
      .from('contacts')
      .update({ lifecycle_stage: stage })
      .in('id', selectedIds)
    loadData()
    setSelectedIds([])
  }
const bulkDelete = async () => {
  if (!selectedIds.length) return

  const confirmDelete = confirm('Delete selected contacts?')
  if (!confirmDelete) return

  const { error } = await supabase
    .from('contacts')
    .update({ is_deleted: true })
    .in('id', selectedIds)

  if (error) {
    alert(error.message)
    return
  }

  loadData()
  setSelectedIds([])
}
  const bulkReassign = async (userId: string) => {
    if (!selectedIds.length || !isOwner) return
    await supabase
      .from('contacts')
      .update({ assigned_user_id: userId })
      .in('id', selectedIds)
    loadData()
    setSelectedIds([])
  }

  const isUpcoming = (dateString: string | null) => {
    if (!dateString) return false
    const today = new Date()
    const date = new Date(dateString)
    date.setFullYear(today.getFullYear())
    const diff = (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 30
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  const uniqueAssigned = [...new Set(contacts.map(c => c.assigned_user_id))]
  const allTags = Array.from(new Set(
    contacts.flatMap(c => c.tags || [])
  ))

  return (
    <div className="min-h-screen bg-gray-50 p-10">
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow overflow-hidden">

        <div className="p-8 border-b space-y-6">
          <div className="flex items-center justify-between mb-6">
  <h1 className="text-2xl font-semibold">Contacts</h1>

  <div className="flex gap-3">
    <button
      onClick={() => router.push('/dashboard/contacts/import')}
      className="border border-gray-300 bg-white px-4 py-2 rounded-md hover:bg-gray-50 transition text-sm font-medium"
    >
      Import Contacts
    </button>

    <button
      onClick={() => router.push('/dashboard/contacts/new')}
      className="bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition text-sm"
    >
      + Add Contact
    </button>
  </div>
</div>

          <div className="grid md:grid-cols-4 gap-4">
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded px-4 py-2"
            />

            <select
              value={lifecycleFilter}
              onChange={(e) => setLifecycleFilter(e.target.value)}
              className="border rounded px-4 py-2"
            >
              <option value="">All Stages</option>
              {LIFECYCLE_OPTIONS.map(stage => (
                <option key={stage}>{stage}</option>
              ))}
            </select>

            <select
              value={assignedFilter}
              onChange={(e) => setAssignedFilter(e.target.value)}
              className="border rounded px-4 py-2"
            >
              <option value="">All Assigned</option>
              {uniqueAssigned.map(id => (
                <option key={id} value={id}>
                  {profiles[id] || 'Unknown'}
                </option>
              ))}
            </select>

            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="border rounded px-4 py-2"
            >
              <option value="">All Tags</option>
              {allTags.map(tag => (
                <option key={tag}>{tag}</option>
              ))}
            </select>
          </div>

          {selectedIds.length > 0 && (
  <div className="flex gap-4 items-center">
    <select
      onChange={(e) => bulkLifecycleUpdate(e.target.value)}
      className="border rounded px-3 py-2"
    >
      <option>Bulk Update Stage</option>
      {LIFECYCLE_OPTIONS.map(stage => (
        <option key={stage}>{stage}</option>
      ))}
    </select>

    {isOwner && (
      <select
        onChange={(e) => bulkReassign(e.target.value)}
        className="border rounded px-3 py-2"
      >
        <option>Bulk Reassign</option>
        {uniqueAssigned.map(id => (
          <option key={id} value={id}>
            {profiles[id]}
          </option>
        ))}
      </select>
    )}

    <button
      onClick={bulkDelete}
      className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
    >
      Delete Selected
    </button>
  </div>
)}
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4"></th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Stage</th>
              <th>Tags</th>
              <th>Birthday</th>
              <th>Anniversary</th>
              <th>Assigned</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(c => (
              <tr
                key={c.id}
                className="border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => router.push(`/dashboard/contacts/${c.id}`)}
              >
                <td className="p-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => toggleSelect(c.id)}
                  />
                </td>
                <td>
                  {c.preferred_name || c.first_name} {c.last_name}
                </td>
                <td>{c.email}</td>
                <td>{c.phone}</td>
                <td>{c.lifecycle_stage}</td>
                <td>
                  {c.tags?.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-gray-100 rounded mr-1 text-xs">
                      {tag}
                    </span>
                  ))}
                </td>
                <td className={isUpcoming(c.birthday) ? 'text-green-600 font-semibold' : ''}>
                  {c.birthday}
                </td>
                <td className={isUpcoming(c.home_purchase_date) ? 'text-blue-600 font-semibold' : ''}>
                  {c.home_purchase_date}
                </td>
                <td>
  {profiles[c.assigned_user_id] || ''}
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

      </div>
    </div>
  )
}
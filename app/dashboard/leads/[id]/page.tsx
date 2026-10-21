'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import TaskModal from '@/app/components/TaskModal'

type Lead = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  status: string
  source: string
  hear_about: string | null
  hear_about_other: string | null
  working_with_realtor: boolean | null
  realtor_name: string | null
  buyer_stage: string | null
  wants_feature_sheet: boolean
  property_id: string
  open_house_event_id: string | null
  account_id: string
  assigned_user_id: string | null
  contact_id: string   // ✅ ADD THIS
  created_at: string
}

type Property = {
  id: string
  address: string
}

type Event = {
  id: string
  event_date: string
}

type Profile = {
  id: string
  full_name: string
}

type Note = {
  id: string
  content: string
  user_id: string
  created_at: string
}

type Attendance = {
  id: string
  visited_at: string
  open_house_event_id: string
}

type Activity = {
  id: string
  type: string
  metadata: any
  user_id: string
  created_at: string
  user?: {
    id: string
    full_name: string
  }
}
type Task = {
  id: string
  title: string
  due_date: string
  priority: string
  status: string
  assigned_user_id: string | null
  lead_id: string | null
}
export default function LeadProfilePage() {
  const params = useParams()
  const router = useRouter()
  const leadId = params.id as string

  const [lead, setLead] = useState<Lead | null>(null)
  const [deal, setDeal] = useState<any>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [attendances, setAttendances] = useState<Attendance[]>([])
const [notes, setNotes] = useState<Note[]>([])
const [activities, setActivities] = useState<Activity[]>([])
const [newNote, setNewNote] = useState('')
const [noteError, setNoteError] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
const [savingStatus, setSavingStatus] = useState(false)
const [savingAssignment, setSavingAssignment] = useState(false)
const [statusSaved, setStatusSaved] = useState(false)
const [statusError, setStatusError] = useState<string | null>(null)
const [assignmentSaved, setAssignmentSaved] = useState(false)
const [assignmentError, setAssignmentError] = useState<string | null>(null)
const [followupError, setFollowupError] = useState<string | null>(null)
const [enrollments, setEnrollments] = useState<any[]>([])
const [notLeadOpen, setNotLeadOpen] = useState(false)
const [notLeadReason, setNotLeadReason] = useState('not_interested')
const [pauseDrips, setPauseDrips] = useState(true)
const [notLeadSaving, setNotLeadSaving] = useState(false)
const [notLeadError, setNotLeadError] = useState<string | null>(null)
const [taskModalOpen, setTaskModalOpen] = useState(false)
const [convertModalOpen, setConvertModalOpen] = useState(false)
const [convertType, setConvertType] = useState<'Buyer' | 'Seller'>('Buyer')
const [convertAddress, setConvertAddress] = useState('')
const [convertStatus, setConvertStatus] = useState('Active')
const [convertPhone, setConvertPhone] = useState('')
const [taskMode, setTaskMode] = useState<'create' | 'edit'>('create')
const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const loadData = async () => {
    const { data: leadData } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (!leadData) {
      router.push('/dashboard/open-houses')
      return
    }

    setLead(leadData)

// LOAD DRIP ENROLLMENTS FOR THIS CONTACT
const { data: enrollData } = await supabase
  .from('contact_campaigns')
  .select('id, campaign_id, status, current_step, next_send_at')
  .eq('contact_id', leadData.contact_id)

if (enrollData && enrollData.length > 0) {
  const campIds = [...new Set(enrollData.map(e => e.campaign_id))]
  const { data: campData } = await supabase
    .from('email_campaigns')
    .select('id, name')
    .in('id', campIds)
  const campNames: Record<string, string> = {}
  campData?.forEach(c => { campNames[c.id] = c.name })

  const { data: seqData } = await supabase
    .from('email_sequences')
    .select('campaign_id, step_number')
    .in('campaign_id', campIds)
  const campTotals: Record<string, number> = {}
  seqData?.forEach(s => {
    campTotals[s.campaign_id] = Math.max(campTotals[s.campaign_id] || 0, s.step_number)
  })

  setEnrollments(
    enrollData.map(e => ({
      ...e,
      campaign_name: campNames[e.campaign_id] || 'Email drip',
      total_steps: campTotals[e.campaign_id] || null,
    }))
  )
} else {
  setEnrollments([])
}

// LOAD DEAL FOR THIS CONTACT
const { data: dealData, error: dealError } = await supabase
  .from('deals')
  .select('*')
  .eq('contact_id', leadData.contact_id)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()

if (dealError) {
  console.error('Deal load error:', dealError)
}

setDeal(dealData || null)

// LOAD PROPERTY
const { data: propertyData, error: propertyError } = await supabase
  .from('properties')
  .select('id, address')
  .eq('id', leadData.property_id)
  .maybeSingle()

if (propertyError) {
  console.error('Property load error:', propertyError)
}

setProperty(propertyData || null)

    if (leadData.open_house_event_id) {
      const { data: eventData } = await supabase
        .from('open_house_events')
        .select('id, event_date')
        .eq('id', leadData.open_house_event_id)
        .single()

      setEvent(eventData || null)
    }

    const { data: attendanceData } = await supabase
      .from('open_house_attendances')
      .select('id, visited_at, open_house_event_id')
      .eq('lead_id', leadId)
      .order('visited_at', { ascending: false })

    setAttendances(attendanceData || [])

    const { data: accountUsers, error: accountUsersError } = await supabase
  .from('account_users')
  .select('user_id, role, account_id')
  .eq('account_id', leadData.account_id)

console.log('ACCOUNT USERS RESULT:', accountUsers)
console.log('ACCOUNT USERS ERROR:', accountUsersError)

    const { data: currentUser } = await supabase.auth.getUser()

    if (currentUser.user) {
  const { data: membership } = await supabase
    .from('account_users')
    .select('account_id, role')
    .eq('user_id', currentUser.user.id)
    .single()

  if (!membership) return

  setIsOwner(membership.role === 'owner')

  const res = await fetch(`/api/team-members?accountId=${membership.account_id}`)
  const team = await res.json()

  setTeamMembers(team || [])
}
    const { data: notesData } = await supabase
      .from('notes')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    setNotes(notesData || [])
    const { data: activityData } = await supabase
  .from('lead_activity')
  .select(`
    *,
    user:profiles!lead_activity_user_id_fkey (
      id,
      full_name
    )
  `)
  .eq('lead_id', leadId)
  .order('created_at', { ascending: false })

setActivities(activityData || [])

    setLoading(false)
  }

  useEffect(() => {
    if (leadId) loadData()
  }, [leadId])
const updateStatus = async (status: string) => {
  if (!lead) return
  if (status === lead.status) return
  setSavingStatus(true)
setStatusSaved(false)
setStatusError(null)

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    setSavingStatus(false)
    setStatusError('Could not save status — please try again.')
    return
  }

  // Update the lead FIRST — only log activity and show "Saved" if it worked.
  // The select is controlled by lead.status, so on failure it reverts on its own.
  const { error: updateError } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', lead.id)

  if (updateError) {
    setSavingStatus(false)
    setStatusError('Could not save status — please try again.')
    return
  }

  const { data: insertedActivity } = await supabase
    .from('lead_activity')
    .insert([
      {
        lead_id: lead.id,
        account_id: lead.account_id,
        user_id: userData.user.id,
        type: 'status_changed',
        metadata: {
          from: lead.status,
          to: status,
        },
      },
    ])
    .select(`
      *,
      user:profiles!lead_activity_user_id_fkey (
        id,
        full_name
      )
    `)
    .single()

  setLead({ ...lead, status })
  setSavingStatus(false)
setStatusSaved(true)

setTimeout(() => {
  setStatusSaved(false)
}, 2000)
  if (insertedActivity) {
    setActivities((prev) => [insertedActivity, ...prev])
  }
}
const NOT_LEAD_REASONS: Record<string, string> = {
  became_client: 'Became a client',
  not_interested: 'Not interested',
  bad_fit: 'Bad fit',
  duplicate: 'Duplicate',
  other: 'Other',
}

const markNotLead = async () => {
  if (!lead) return
  setNotLeadSaving(true)
  setNotLeadError(null)

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    setNotLeadSaving(false)
    setNotLeadError('Could not save — please try again.')
    return
  }

  const newStatus = notLeadReason === 'became_client' ? 'Client' : 'Lost'

  // Update the lead FIRST — only log activity if it worked.
  const { error: updateError } = await supabase
    .from('leads')
    .update({ status: newStatus })
    .eq('id', lead.id)

  if (updateError) {
    setNotLeadSaving(false)
    setNotLeadError('Could not save — please try again.')
    return
  }

  await supabase.from('lead_activity').insert([
    {
      lead_id: lead.id,
      account_id: lead.account_id,
      user_id: userData.user.id,
      type: 'not_a_lead',
      metadata: {
        reason: notLeadReason,
        reason_label: NOT_LEAD_REASONS[notLeadReason] || notLeadReason,
        from: lead.status,
        to: newStatus,
        drips_paused: pauseDrips,
      },
    },
  ])

  if (pauseDrips && lead.contact_id) {
    await supabase
      .from('contact_campaigns')
      .update({ status: 'paused' })
      .eq('contact_id', lead.contact_id)
      .eq('status', 'active')
  }

  setNotLeadSaving(false)
  setNotLeadOpen(false)
  router.push('/dashboard/leads')
}

// DEAL STATUS UPDATE
const updateDealStatus = async (status: string) => {
  if (!deal) return

  const { error } = await supabase
    .from('deals')
    .update({ status })
    .eq('id', deal.id)

  if (error) {
    console.error('Deal update error:', error)
    alert('Error updating deal')
    return
  }

  setDeal({ ...deal, status })
}
const updateAssignment = async (userId: string) => {
  if (!lead || !isOwner) return
  if (userId === lead.assigned_user_id) return

  const confirmChange = confirm(
    'Are you sure you want to reassign this lead?'
  )

  if (!confirmChange) return

  setSavingAssignment(true)
  setAssignmentSaved(false)
  setAssignmentError(null)

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    setSavingAssignment(false)
    setAssignmentError('Could not save assignment — please try again.')
    return
  }

  // Update the lead FIRST — only log activity and show "Saved" if it worked.
  // The select is controlled by lead.assigned_user_id, so on failure it reverts on its own.
  const { error: updateError } = await supabase
    .from('leads')
    .update({ assigned_user_id: userId })
    .eq('id', lead.id)

  if (updateError) {
    setSavingAssignment(false)
    setAssignmentError('Could not save assignment — please try again.')
    return
  }

  // Log activity only after the update succeeded
  await supabase.from('lead_activity').insert([
    {
      lead_id: lead.id,
      account_id: lead.account_id,
      user_id: userData.user.id,
      type: 'reassigned',
      metadata: {
        from: lead.assigned_user_id,
        to: userId,
      },
    },
  ])

  setLead({ ...lead, assigned_user_id: userId })
  setSavingAssignment(false)
  setAssignmentSaved(true)

  setTimeout(() => {
    setAssignmentSaved(false)
  }, 2000)
}
const createDealWithProperty = async (
  dealType: 'Buyer' | 'Seller',
  dealStatus: string,
  address: string,
  phone?: string
) => {
  if (!lead) return

  // 1. CREATE PROPERTY
 const { data: userData } = await supabase.auth.getUser()
if (!userData.user) {
  alert('User not authenticated')
  return
}

const { data: propertyData, error: propertyError } = await supabase
  .from('properties')
  .insert([
    {
      account_id: lead.account_id,
      address: address,
      user_id: userData.user.id,
    },
  ])
  .select()
  .single()

  if (propertyError || !propertyData) {
    console.error('Property creation error:', propertyError)
    alert('Error creating property')
    return
  }

  // 2. CREATE DEAL
  const { error: dealError } = await supabase.from('deals').insert([
    {
      account_id: lead.account_id,
      contact_id: lead.contact_id,
      assigned_user_id: lead.assigned_user_id,
      property_id: propertyData.id,
      deal_type: dealType,
      status: dealStatus,
    },
  ])

  if (dealError) {
    console.error('Deal creation error:', dealError)
    alert('Error creating deal')
    return
  }

  // 3. OPTIONAL PHONE UPDATE
  if (phone && phone.trim()) {
    await supabase
      .from('leads')
      .update({ phone })
      .eq('id', lead.id)
  }

  // 4. UPDATE LEAD STATUS → CLIENT
  await supabase
    .from('leads')
    .update({ status: 'Client' })
    .eq('id', lead.id)

  // 5. RELOAD UI
  await loadData()

  alert(`${dealType} deal created`)
}
  const addNote = async () => {
    if (!newNote.trim() || !lead) return

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data, error } = await supabase
      .from('notes')
      .insert([
        {
          lead_id: lead.id,
          account_id: lead.account_id,
          user_id: userData.user.id,
          content: newNote
        }
      ])
      .select()
      .single()

    if (error) {
      setNoteError('Could not save your note. Please try again.')
      return
    }

    if (data) {
      setNoteError(null)
      setNotes(prev => [data, ...prev])
      setNewNote('')

      // A note usually means you just touched base with this lead:
      // stamp the last-contact time, and clear any open drip check-in
      // task for them so it doesn't sit there asking again.
      await supabase
        .from('leads')
        .update({ last_contacted_at: new Date().toISOString() })
        .eq('id', lead.id)

      await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('lead_id', lead.id)
        .eq('source', 'drip_checkin')
        .eq('status', 'pending')
    }
  }

  if (loading || !lead) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      Loading...
    </div>
  )
}

  return (
    <div className="min-h-screen bg-gray-50 p-10">
      <div className="max-w-6xl mx-auto space-y-10">

       <div className="bg-white rounded-2xl shadow p-8 border-b">
  <div className="flex justify-between items-start">
    <div>
      <h1 className="text-3xl font-semibold">
        {lead.first_name} {lead.last_name}
      </h1>
      <p className="text-gray-500 mt-1">
        Created {new Date(lead.created_at).toLocaleString()}
      </p>
    </div>

    <div className="flex gap-6 items-start">
      {/* STATUS */}
<div className="flex flex-col min-w-[180px]">
  <label className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
    Status
  </label>
<div className="flex flex-col min-w-[180px]">
  <label className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
    Next Follow-Up
  </label>

  <input
    type="date"
    value={(lead as any).next_followup_date || ''}
    onChange={async (e) => {
      const value = e.target.value

      // Update the DB FIRST — only update local state if it worked.
      // The input is controlled by lead.next_followup_date, so on failure it reverts on its own.
      const { error: followupUpdateError } = await supabase
        .from('leads')
        .update({ next_followup_date: value || null })
        .eq('id', lead.id)

      if (followupUpdateError) {
        setFollowupError('Could not save follow-up date — please try again.')
        return
      }

      setFollowupError(null)

      // update local state
      setLead({ ...lead, next_followup_date: value } as any)
    }}
    className="border rounded-lg px-4 py-2"
  />

  {followupError && (
    <span className="text-xs text-red-600 mt-1">
      {followupError}
    </span>
  )}
</div>
  <select
    value={lead.status || 'New'}
    onChange={(e) => updateStatus(e.target.value)}
    disabled={savingStatus}
    className={`border rounded-lg px-4 py-2 transition-all ${
      savingStatus ? 'opacity-60 cursor-not-allowed' : ''
    }`}
  >
   <option value="New">New</option>
<option value="Contacted">Contacted</option>
<option value="Hot">Hot</option>
<option value="Cold">Cold</option>
<option value="Client">Client</option>
<option value="Closed">Closed</option>
<option value="Lost">Lost</option>
  </select>

  {savingStatus && (
    <span className="text-xs text-gray-400 mt-1">
      Saving...
    </span>
  )}

  {statusSaved && !savingStatus && (
    <span className="text-xs text-green-600 mt-1">
      Saved ✓
    </span>
  )}

  {statusError && !savingStatus && (
    <span className="text-xs text-red-600 mt-1">
      {statusError}
    </span>
  )}
</div>

       {/* ASSIGNED + TASK ACTIONS */}
{isOwner && (
  <div className="flex items-end gap-6">

    {/* ASSIGNED */}
    <div className="flex flex-col min-w-[220px]">
      <label className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
        Assigned Agent
      </label>

      <select
        value={lead.assigned_user_id || ''}
        onChange={(e) => updateAssignment(e.target.value)}
        disabled={savingAssignment}
        className={`border rounded-lg px-4 py-2 transition-all ${
          savingAssignment ? 'opacity-60 cursor-not-allowed' : ''
        }`}
      >
        {teamMembers.map((member) => (
          <option key={member.id} value={member.id}>
            {member.full_name}
          </option>
        ))}
      </select>

      {savingAssignment && (
        <span className="text-xs text-gray-400 mt-1">
          Saving...
        </span>
      )}

      {assignmentSaved && !savingAssignment && (
        <span className="text-xs text-green-600 mt-1">
          Saved ✓
        </span>
      )}

      {assignmentError && !savingAssignment && (
        <span className="text-xs text-red-600 mt-1">
          {assignmentError}
        </span>
      )}
    </div>

{/* NEW TASK BUTTON + CONVERT */}
<div className="flex flex-col gap-3">

  <button
    onClick={() => {
      setTaskMode('create')
      setSelectedTask(null)
      setTaskModalOpen(true)
    }}
    className="bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-900 transition"
  >
    + New Task
  </button>

  <button
    onClick={() => setNotLeadOpen(true)}
    className="text-sm text-gray-500 underline hover:text-gray-700 text-left"
  >
    Not a lead anymore?
  </button>

  {/* Convert moved to Deals page */}

  {deal && (
    <div className="flex flex-col min-w-[180px] ml-2">
      <label className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
        Deal Status
      </label>

      <select
        value={deal.status}
        onChange={(e) => updateDealStatus(e.target.value)}
        className="border rounded-lg px-4 py-2"
      >
        <option value="Active">Active</option>
        <option value="Sold Conditional">Sold Conditional</option>
        <option value="Sold Firm">Sold Firm</option>
        <option value="Closed">Closed</option>
      </select>
    </div>
  )}

</div>

  </div>
)}
</div>
</div>
</div>
        <div className="grid md:grid-cols-2 gap-8">

          <div className="bg-white rounded-2xl shadow p-8 space-y-3 text-sm">
            <h3 className="font-semibold text-lg mb-4">Contact Details</h3>
            <p><strong>Email:</strong> {lead.email}</p>
            <p><strong>Phone:</strong> {lead.phone || '-'}</p>
            <p><strong>Source:</strong> {lead.source}</p>
            <p><strong>Buyer Stage:</strong> {lead.buyer_stage || '-'}</p>
            <p><strong>Working With Realtor:</strong> {lead.working_with_realtor ? 'Yes' : 'No'}</p>
            <p><strong>Realtor Name:</strong> {lead.realtor_name || '-'}</p>
            <p><strong>Wants Feature Sheet:</strong> {lead.wants_feature_sheet ? 'Yes' : 'No'}</p>
            {enrollments.length > 0 && (
              <div className="pt-3 mt-3 border-t">
                <p className="font-semibold mb-2">Email Drips</p>
                {enrollments.map(e => (
                  <p key={e.id} className="text-gray-700">
                    📧 {e.campaign_name} — Step {e.current_step}
                    {e.total_steps ? ` of ${e.total_steps}` : ''} · {e.status}
                    {e.status === 'active' && e.next_send_at
                      ? ` · next ${new Date(e.next_send_at).toLocaleDateString('en-CA')}`
                      : ''}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow p-8 space-y-3 text-sm">
            <h3 className="font-semibold text-lg mb-4">Property & Attendance</h3>
           <p>
  <strong>Address:</strong>{' '}
  {property?.address || (lead as any)?.address || 'Not available'}
</p>
            {event && (
              <p><strong>First Visit:</strong> {new Date(event.event_date).toLocaleDateString()}</p>
            )}
            <div className="mt-4">
              <h4 className="font-medium mb-2">Attendance History</h4>
              {attendances.length === 0 && (
                <p className="text-gray-500">No attendance records.</p>
              )}
              {attendances.map(a => (
                <p key={a.id} className="text-gray-700">
                  {new Date(a.visited_at).toLocaleString()}
                </p>
              ))}
            </div>
          </div>

        </div>

        <div className="bg-white rounded-2xl shadow p-8">
          <h3 className="font-semibold text-lg mb-4">Notes</h3>

          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            className="w-full border rounded-lg p-4 mb-4"
            placeholder="Add a note..."
          />

          <button
            onClick={addNote}
            className="bg-black text-white px-6 py-2 rounded-lg"
          >
            Add Note
          </button>

          {noteError && (
            <p className="text-sm text-red-600 mt-3">{noteError}</p>
          )}

          <div className="mt-6 space-y-4">
  {notes.map(note => {
 const urls = (note.content.match(/https?:\/\/[^\s]+/g) || []).filter(u =>
  u.match(/\.(jpg|jpeg|png|webp|gif)/i)
)

  return (
    <div key={note.id} className="border rounded-lg p-4 bg-gray-50">
      {/* TEXT */}
      <p className="text-sm whitespace-pre-wrap">{note.content}</p>

      {/* IMAGES */}
      {urls.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          {urls.map((url, i) => (
            <a key={i} href={url} target="_blank">
              <img
                src={url}
                alt="Uploaded"
                className="w-full h-32 object-cover rounded-lg border hover:opacity-80"
              />
            </a>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-2">
        {new Date(note.created_at).toLocaleString()}
      </p>
    </div>
  )
})}
</div>
</div>

{/* ACTIVITY SECTION */}
<div className="bg-white rounded-2xl shadow p-8">
  <h3 className="font-semibold text-lg mb-4">Activity</h3>

  {activities.length === 0 && (
    <p className="text-gray-500 text-sm">
      No activity recorded.
    </p>
  )}

  <div className="space-y-4">
    {activities.map((activity) => {
      const actorName = activity.user?.full_name || 'System'

      return (
        <div
          key={activity.id}
          className="border rounded-lg p-4 bg-gray-50"
        >
          {/* Actor Name */}
          <div className="text-xs text-gray-400 mb-1">
            {actorName}
          </div>

          {/* Activity Description */}
          <div className="text-sm">
            {activity.type === 'reassigned' && (
              <>
                Lead reassigned
                {activity.metadata?.from && (
                  <> from <strong>{activity.metadata.from}</strong></>
                )}
                {activity.metadata?.to && (
                  <> to <strong>{activity.metadata.to}</strong></>
                )}
              </>
            )}

            {activity.type === 'status_changed' && (
              <>
                Status changed
                {activity.metadata?.from && (
                  <> from <strong>{activity.metadata.from}</strong></>
                )}
                {activity.metadata?.to && (
                  <> to <strong>{activity.metadata.to}</strong></>
                )}
              </>
            )}

            {activity.type === 'not_a_lead' && (
              <>
                Marked not a lead
                {activity.metadata?.reason_label && (
                  <> — <strong>{activity.metadata.reason_label}</strong></>
                )}
                {activity.metadata?.drips_paused ? ' · drips paused' : ''}
              </>
            )}

            {activity.type === 'auto_converted' && (
              <>
                Moved to Clients — already has a deal or client file
              </>
            )}

            {!['reassigned', 'status_changed', 'not_a_lead', 'auto_converted'].includes(activity.type) && (
              <>{activity.type}</>
            )}
          </div>
{/* Timestamp */}
          <div className="text-xs text-gray-500 mt-2">
            {new Date(activity.created_at).toLocaleString()}
          </div>
        </div>
      )
    })}
  </div>
</div>

{notLeadOpen && lead && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-lg w-full max-w-md space-y-4">
      <h2 className="text-xl font-semibold">Not a lead anymore</h2>

      <p className="text-sm text-gray-500">
        {lead.first_name} {lead.last_name} will move out of your working
        leads. You can bring them back anytime from the Clients or Archived
        tab on the Leads page.
      </p>

      <div>
        <label className="block text-sm font-medium mb-1">Reason</label>
        <select
          value={notLeadReason}
          onChange={(e) => setNotLeadReason(e.target.value)}
          className="w-full border p-2 rounded"
        >
          <option value="became_client">Became a client</option>
          <option value="not_interested">Not interested</option>
          <option value="bad_fit">Bad fit</option>
          <option value="duplicate">Duplicate</option>
          <option value="other">Other</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={pauseDrips}
          onChange={(e) => setPauseDrips(e.target.checked)}
        />
        Also pause their email drips
      </label>

      {notLeadError && (
        <p className="text-sm text-red-600">{notLeadError}</p>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setNotLeadOpen(false)}
          className="px-4 py-2 border rounded"
        >
          Cancel
        </button>

        <button
          onClick={markNotLead}
          disabled={notLeadSaving}
          className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
        >
          {notLeadSaving ? 'Saving...' : 'Confirm'}
        </button>
      </div>
    </div>
  </div>
)}

            {taskModalOpen && lead && (
  <TaskModal
    mode={taskMode}
    task={selectedTask}
    onClose={() => setTaskModalOpen(false)}
    onSaved={loadData}
    currentUserId={lead.assigned_user_id}
    isOwner={isOwner}
    leadId={lead.id}
  />
)}
{/* Convert modal removed — now handled in Deals page */}

</div>
</div>
)
}
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { ChevronDown } from 'lucide-react'

type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  preferred_name: string | null

  email: string | null
  secondary_email: string | null
  phone: string | null
  secondary_phone: string | null

  lifecycle_stage: string | null
  assigned_user_id: string

  birthday: string | null
  marriage_anniversary: string | null

  spouse_name: string | null
  children_names: string | null
  number_of_children: number | null
  pet_names: string | null

  address: string | null
  city: string | null
  province: string | null
  postal_code: string | null

  preferred_contact_method: string | null
  best_time_to_contact: string | null
  language_preference: string | null

  source: string | null
  referral_source: string | null
  campaign: string | null
  lead_capture_method: string | null

  last_contacted_at: string | null
  next_followup_date: string | null

  instagram: string | null
  facebook: string | null
  linkedin: string | null
  twitter: string | null

  tags: string[] | null
  created_at: string
}

type Profile = {
  id: string
  full_name: string
}

type Note = {
  id: string
  content: string
  created_at: string
}
type Activity = {
  id: string
  type: string
  metadata: any
  created_at: string
}
type Task = {
  id: string
  title: string
  description: string | null
  due_date: string | null
  due_time: string | null
  priority: string | null
  status: string
  completed_at: string | null
  lead_id: string | null
  contact_id: string | null
}
type Property = {
  id: string
  address: string | null
  city: string | null
  province: string | null
}
type SectionKey =
  | 'personal'
  | 'crm'
  | 'social'

const LIFECYCLE_OPTIONS = [
  'Lead',
  'Active Buyer',
  'Active Seller',
  'Past Client',
  'Sphere',
  'Do Not Contact'
]

export default function ContactDetailPage() {

  const params = useParams()
  const router = useRouter()
  const contactId = params.id as string

  const [contact, setContact] = useState<Contact | null>(null)
  const [teamMembers, setTeamMembers] = useState<Profile[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [deals, setDeals] = useState<any[]>([])
const [newTask, setNewTask] = useState('')
  const [newNote, setNewNote] = useState('')

  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
const [formData, setFormData] = useState<any>(null) 

  const [openSections, setOpenSections] = useState({
    personal: false,
    crm: false,
    social: false
  })

  const toggleSection = (section: SectionKey) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const loadData = async () => {

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id, role')
      .eq('user_id', user.id)
      .single()

    if (!membership) return

    setIsOwner(membership.role === 'owner')

    const { data: contactData } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (!contactData) {
      router.push('/dashboard/contacts')
      return
    }

    setContact(contactData)
  setFormData(contactData)
    const res = await fetch('/api/team-members')
const data = await res.json()
setTeamMembers(data || [])

    const { data: notesData } = await supabase
      .from('notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })

    setNotes(notesData || [])

const { data: taskData } = await supabase
  .from('tasks')
  .select('id, title, description, due_date, due_time, priority, status, completed_at, lead_id, contact_id')
  .eq('contact_id', contactId)
  .order('created_at', { ascending: false })

setTasks(taskData || [])

const { data: activityData } = await supabase
  .from('lead_activity')
  .select('id, type, metadata, created_at')
  .eq('contact_id', contactId)
  .order('created_at', { ascending: false })

setActivities(activityData || [])
const { data: propertyData } = await supabase
  .from('property_contacts')
  .select(`
    properties (
      id,
      address,
      city,
      province
    )
  `)
  .eq('contact_id', contactId)

const parsedProperties =
  propertyData
    ?.map((row: any) => {
      const prop = row.properties

      if (!prop) return null

      if (Array.isArray(prop)) {
        return prop[0]
      }

      return prop
    })
    .filter(Boolean) || []

setProperties(parsedProperties)
const { data: dealData } = await supabase
  .from('deals')
  .select(`
    id,
    status,
    deal_type,
    property_id,
    properties (
      address
    )
  `)
  .eq('contact_id', contactId)

const parsedDeals =
  dealData?.map((d: any) => {
    const prop = d.properties

    return {
      ...d,
      address: Array.isArray(prop) ? prop[0]?.address : prop?.address
    }
  }) || []

setDeals(parsedDeals)
    setLoading(false)
  }

  useEffect(() => {
    if (contactId) loadData()
  }, [contactId])
  const updateField = (field: string, value: any) => {
  if (!formData) return

  setFormData({
    ...formData,
    [field]: value
  })
}

  const addNote = async () => {
    if (!newNote.trim()) return

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data } = await supabase
      .from('notes')
      .insert([
        {
          contact_id: contactId,
          user_id: userData.user.id,
          content: newNote
        }
      ])
      .select()
      .single()

    if (data) {
      setNotes(prev => [data, ...prev])
      setNewNote('')
    }
  }
const addTask = async () => {

  if (!newTask.trim()) return

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return

  const { data: membership } = await supabase
    .from('account_users')
    .select('account_id')
    .eq('user_id', userData.user.id)
    .single()

  if (!membership) return

  const { data } = await supabase
    .from('tasks')
    .insert([
      {
        account_id: membership.account_id,
        contact_id: contactId,
        assigned_user_id: userData.user.id,
        created_by: userData.user.id,
        title: newTask,
        status: 'open'
      }
    ])
    .select()
    .single()

  if (data) {
    setTasks(prev => [data, ...prev])
    setNewTask('')
  }

}
const completeTask = async (taskId: string) => {

  const now = new Date().toISOString()

  const { data: task } = await supabase
    .from('tasks')
    .update({
      status: 'completed',
      completed_at: now
    })
    .eq('id', taskId)
    .select()
    .single()

  if (!task) return

  setTasks(prev =>
    prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'completed', completed_at: now }
        : t
    )
  )

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return

  const { data: membership } = await supabase
    .from('account_users')
    .select('account_id')
    .eq('user_id', userData.user.id)
    .single()

  if (!membership) return

  await supabase
    .from('lead_activity')
    .insert([
      {
        account_id: membership.account_id,
        contact_id: task.contact_id,
        lead_id: task.lead_id,
        user_id: userData.user.id,
        type: 'task_completed',
        metadata: {
          task_title: task.title
        }
      }
    ])

}
const handleCancel = () => {
  if (!contact) return
  setFormData(contact)
  setIsEditing(false)
}

const handleSave = async () => {
  if (!formData || !contact) return

  const { error } = await supabase
    .from('contacts')
    .update(formData)
    .eq('id', contact.id)

  if (error) {
    alert('Error saving changes')
    return
  }

  setContact(formData)
  setIsEditing(false)
  alert('Saved successfully')
}
  if (loading || !contact) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    )
  }

  return (

    <div className="min-h-screen bg-gray-50 p-8">

      <div className="max-w-7xl mx-auto space-y-6">

        {/* HEADER */}

<div className="bg-white rounded-xl shadow p-6 flex justify-between">

  <div>
    <h1 className="text-3xl font-bold">
      {formData?.preferred_name || formData?.first_name} {formData?.last_name}
    </h1>

    <p className="text-sm text-gray-500">
      Created {new Date(formData.created_at).toLocaleDateString()}
    </p>
  </div>

  <div className="flex items-start gap-4">

    <div className="space-y-3 text-right">

      <div>

        <label className="text-xs text-gray-500 block mb-1">
          Lifecycle Stage
        </label>

        <select
          disabled={!isEditing}
          value={formData?.lifecycle_stage || ''}
          onChange={(e) =>
            updateField('lifecycle_stage', e.target.value)
          }
          className="border rounded px-3 py-2"
        >
          {LIFECYCLE_OPTIONS.map(stage => (
            <option key={stage}>{stage}</option>
          ))}
        </select>

      </div>

      {isOwner && (

        <div>

          <label className="text-xs text-gray-500 block mb-1">
            Assigned Agent
          </label>

          <select
            disabled={!isEditing}
            value={formData?.assigned_user_id}
            onChange={(e) =>
              updateField('assigned_user_id', e.target.value)
            }
            className="border rounded px-3 py-2"
          >
            {teamMembers.map(member => (
  <option key={member.id} value={member.id}>
    {member.full_name}
  </option>
))}
          </select>

        </div>

      )}

    </div>

    <button
      onClick={() => setIsEditing(true)}
      className="bg-black text-white px-4 py-2 rounded"
    >
      Edit
    </button>

  </div>

</div>
        {/* CONTACT + ADDRESS */}

<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

  {/* CONTACT */}

  <div className="bg-white rounded-xl shadow p-6 space-y-4">

    <h3 className="font-semibold">Contact Information</h3>

    <div>
      <label className="text-xs text-gray-500">First Name</label>
      <input
        value={formData?.first_name || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('first_name', e.target.value)}
        className="w-full border rounded p-2"
      />
    </div>

    <div>
      <label className="text-xs text-gray-500">Last Name</label>
      <input
        value={formData?.last_name || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('last_name', e.target.value)}
        className="w-full border rounded p-2"
      />
    </div>

    <div>
      <label className="text-xs text-gray-500">Preferred Name</label>
      <input
        value={formData?.preferred_name || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('preferred_name', e.target.value)}
        className="w-full border rounded p-2"
      />
    </div>

    <div>
      <label className="text-xs text-gray-500">Cell Phone</label>
      <input
        value={formData?.phone || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('phone', e.target.value)}
        className="w-full border rounded p-2"
      />
    </div>

    <div>
      <label className="text-xs text-gray-500">Home Phone</label>
      <input
        value={formData?.secondary_phone || ''}
        disabled={!isEditing}
        onChange={(e) =>
          updateField('secondary_phone', e.target.value)
        }
        className="w-full border rounded p-2"
      />
    </div>

    <div>
      <label className="text-xs text-gray-500">Email</label>
      <input
        value={formData?.email || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('email', e.target.value)}
        className="w-full border rounded p-2"
      />
    </div>

    <div>
      <label className="text-xs text-gray-500">
        Secondary Email
      </label>
      <input
        value={formData?.secondary_email || ''}
        disabled={!isEditing}
        onChange={(e) =>
          updateField('secondary_email', e.target.value)
        }
        className="w-full border rounded p-2"
      />
    </div>

    <div>
      <label className="text-xs text-gray-500">
        Preferred Contact Method
      </label>
      <input
        value={formData?.preferred_contact_method || ''}
        disabled={!isEditing}
        onChange={(e) =>
          updateField('preferred_contact_method', e.target.value)
        }
        className="w-full border rounded p-2"
      />
    </div>

    <div>
      <label className="text-xs text-gray-500">
        Best Time To Contact
      </label>
      <input
        value={formData?.best_time_to_contact || ''}
        disabled={!isEditing}
        onChange={(e) =>
          updateField('best_time_to_contact', e.target.value)
        }
        className="w-full border rounded p-2"
      />
    </div>

  </div>

  {/* ADDRESS */}

  <div className="bg-white rounded-xl shadow p-6 space-y-4">

    <h3 className="font-semibold">Address</h3>

    <input
      value={formData?.address || ''}
      disabled={!isEditing}
      onChange={(e) => updateField('address', e.target.value)}
      className="w-full border rounded p-2"
      placeholder="Street Address"
    />

    <input
      value={formData?.city || ''}
      disabled={!isEditing}
      onChange={(e) => updateField('city', e.target.value)}
      className="w-full border rounded p-2"
      placeholder="City"
    />

    <input
      value={formData?.province || ''}
      disabled={!isEditing}
      onChange={(e) => updateField('province', e.target.value)}
      className="w-full border rounded p-2"
      placeholder="Province"
    />

    <input
      value={formData?.postal_code || ''}
      disabled={!isEditing}
      onChange={(e) => updateField('postal_code', e.target.value)}
      className="w-full border rounded p-2"
      placeholder="Postal Code"
    />

  </div>

</div>

{/* PERSONAL DETAILS */}

<div className="bg-white rounded-xl shadow">

  <button
    onClick={() => toggleSection('personal')}
    className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition border-b cursor-pointer"
  >
    <span className="font-semibold text-gray-800">
      Personal Details
    </span>

    <ChevronDown
      className={`h-5 w-5 text-gray-400 transition-transform ${
        openSections.personal ? 'rotate-180' : ''
      }`}
    />
  </button>

  {openSections.personal && (

    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">

      <input
        value={formData?.spouse_name || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('spouse_name', e.target.value)}
        className="w-full border rounded p-2"
      />

      <input
        value={formData?.pet_names || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('pet_names', e.target.value)}
        className="w-full border rounded p-2"
      />

      <input
        value={formData?.children_names || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('children_names', e.target.value)}
        className="w-full border rounded p-2"
      />

      <input
        type="number"
        value={formData?.number_of_children ?? ''}
        disabled={!isEditing}
        onChange={(e) =>
          updateField('number_of_children', Number(e.target.value))
        }
        className="w-full border rounded p-2"
      />

      <input
        type="date"
        value={formData?.birthday || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('birthday', e.target.value)}
        className="w-full border rounded p-2"
      />

      <input
        type="date"
        value={formData?.marriage_anniversary || ''}
        disabled={!isEditing}
        onChange={(e) =>
          updateField('marriage_anniversary', e.target.value)
        }
        className="w-full border rounded p-2"
      />

    </div>

  )}

</div>

{/* CRM DETAILS */}

<div className="bg-white rounded-xl shadow">

  <button
    onClick={() => toggleSection('crm')}
    className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition border-b cursor-pointer"
  >
    <span className="font-semibold text-gray-800">
      CRM Details
    </span>

    <ChevronDown
      className={`h-5 w-5 text-gray-400 transition-transform ${
        openSections.crm ? 'rotate-180' : ''
      }`}
    />
  </button>

  {openSections.crm && (

    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">

      <input
        value={formData?.source || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('source', e.target.value)}
        className="w-full border rounded p-2"
      />

      <input
        value={formData?.referral_source || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('referral_source', e.target.value)}
        className="w-full border rounded p-2"
      />

      <input
        value={formData?.campaign || ''}
        disabled={!isEditing}
        onChange={(e) => updateField('campaign', e.target.value)}
        className="w-full border rounded p-2"
      />

      <input
        value={formData?.lead_capture_method || ''}
        disabled={!isEditing}
        onChange={(e) =>
          updateField('lead_capture_method', e.target.value)
        }
        className="w-full border rounded p-2"
      />

      <input
        type="date"
        value={formData?.last_contacted_at || ''}
        disabled={!isEditing}
        onChange={(e) =>
          updateField('last_contacted_at', e.target.value)
        }
        className="w-full border rounded p-2"
      />

      <input
        type="date"
        value={formData?.next_followup_date || ''}
        disabled={!isEditing}
        onChange={(e) =>
          updateField('next_followup_date', e.target.value)
        }
        className="w-full border rounded p-2"
      />

    </div>

  )}

</div>

        {/* SOCIAL PROFILES */}

<div className="bg-white rounded-xl shadow">

  <button
    onClick={() => toggleSection('social')}
    className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition border-b cursor-pointer"
  >

    <span className="font-semibold text-gray-800">
      Social Profiles
    </span>

    <ChevronDown
      className={`h-5 w-5 text-gray-400 transition-transform ${
        openSections.social ? 'rotate-180' : ''
      }`}
    />

  </button>

  {openSections.social && (

    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">

      <div>
        <label className="text-xs text-gray-500">
          Instagram
        </label>
        <input
          value={formData?.instagram || ''}
          disabled={!isEditing}
          onChange={(e) =>
            updateField('instagram', e.target.value)
          }
          className="w-full border rounded p-2"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500">
          Facebook
        </label>
        <input
          value={formData?.facebook || ''}
          disabled={!isEditing}
          onChange={(e) =>
            updateField('facebook', e.target.value)
          }
          className="w-full border rounded p-2"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500">
          LinkedIn
        </label>
        <input
          value={formData?.linkedin || ''}
          disabled={!isEditing}
          onChange={(e) =>
            updateField('linkedin', e.target.value)
          }
          className="w-full border rounded p-2"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500">
          Twitter
        </label>
        <input
          value={formData?.twitter || ''}
          disabled={!isEditing}
          onChange={(e) =>
            updateField('twitter', e.target.value)
          }
          className="w-full border rounded p-2"
        />
      </div>

    </div>

  )}

</div>
        
        {/* TASKS */}

<div className="bg-white rounded-xl shadow p-6">

  <h3 className="font-semibold mb-4">Tasks</h3>

  <div className="flex gap-2 mb-4">

    <input
      value={newTask}
      onChange={(e) => setNewTask(e.target.value)}
      placeholder="Add a task..."
      className="flex-1 border rounded p-2"
    />

    <button
      onClick={addTask}
      className="bg-black text-white px-4 py-2 rounded"
    >
      Add
    </button>

  </div>

  {tasks.length === 0 && (
    <p className="text-sm text-gray-500">
      No tasks yet.
    </p>
  )}

  <div className="space-y-3">

    {tasks.map(task => (

      <div
        key={task.id}
        className="flex items-center justify-between border rounded p-3 bg-gray-50"
      >

        <div>

          <p className={`text-sm ${task.status === 'completed' ? 'line-through text-gray-400' : ''}`}>
            {task.title}
          </p>

          {task.due_date && (
            <p className="text-xs text-gray-500">
              Due {new Date(task.due_date).toLocaleDateString()}
            </p>
          )}

        </div>

        {task.status !== 'completed' && (
          <button
            onClick={() => completeTask(task.id)}
            className="text-xs bg-green-600 text-white px-3 py-1 rounded"
          >
            Complete
          </button>
        )}

      </div>

    ))}

  </div>

</div>
        {/* ACTIVITY TIMELINE */}

<div className="bg-white rounded-xl shadow p-6">

  <h3 className="font-semibold mb-4">Activity</h3>

  {activities.length === 0 && (
    <p className="text-sm text-gray-500">
      No activity yet.
    </p>
  )}

  <div className="space-y-4">

    {activities.map(activity => (

      <div
        key={activity.id}
        className="border rounded p-4 bg-gray-50"
      >

        <p className="text-sm font-medium">
          {activity.type.replaceAll('_', ' ')}
        </p>

        {activity.metadata && (
          <p className="text-sm text-gray-600 mt-1">
            {JSON.stringify(activity.metadata)}
          </p>
        )}

        <p className="text-xs text-gray-500 mt-2">
          {new Date(activity.created_at).toLocaleString()}
        </p>

      </div>

    ))}

  </div>

</div>
{/* DEALS */}

<div className="bg-white rounded-xl shadow p-6">

  <h3 className="font-semibold mb-4">Deals</h3>

  {deals.length === 0 && (
    <p className="text-sm text-gray-500">
      No deals for this contact.
    </p>
  )}

  <div className="space-y-3">

    {deals.map(deal => (

      <div
        key={deal.id}
        className="flex items-center justify-between border rounded p-3 bg-gray-50"
      >

        <div>

          <p className="text-sm font-medium">
            {deal.address || 'Property'}
          </p>

          <p className="text-xs text-gray-500">
            {deal.deal_type} • {deal.status}
          </p>

        </div>

        <button
          onClick={() =>
            router.push(`/dashboard/deals/${deal.id}`)
          }
          className="text-sm text-blue-600 hover:underline"
        >
          View
        </button>

      </div>

    ))}

  </div>

</div>
{/* PROPERTIES */}

<div className="bg-white rounded-xl shadow p-6">

  <h3 className="font-semibold mb-4">Properties</h3>

  {properties.length === 0 && (
    <p className="text-sm text-gray-500">
      This contact is not linked to any properties.
    </p>
  )}

  <div className="space-y-3">

    {properties.map(property => (

      <div
        key={property.id}
        className="flex items-center justify-between border rounded p-3 bg-gray-50"
      >

        <div>

          <p className="text-sm font-medium">
            {property.address || 'Property'}
          </p>

          <p className="text-xs text-gray-500">
            {property.city} {property.province}
          </p>

        </div>

        <button
          onClick={() =>
            router.push(`/dashboard/properties/${property.id}`)
          }
          className="text-sm text-blue-600 hover:underline"
        >
          View
        </button>

      </div>

    ))}

  </div>

</div>
                {/* NOTES */}

        <div className="bg-white rounded-xl shadow p-6">

          <h3 className="font-semibold mb-4">Notes</h3>

          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            className="w-full border rounded p-3 mb-3"
            placeholder="Add a note..."
          />

          <button
            onClick={addNote}
            className="bg-black text-white px-4 py-2 rounded"
          >
            Add Note
          </button>

          <div className="mt-6 space-y-4">

            {notes.map(note => (

              <div
                key={note.id}
                className="border rounded p-4 bg-gray-50"
              >

                <p className="text-sm">
                  {note.content}
                </p>

                <p className="text-xs text-gray-500 mt-2">
                  {new Date(note.created_at).toLocaleString()}
                </p>

              </div>

            ))}

          </div>

        </div>

      </div>
{isEditing && (
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 flex justify-between items-center z-50">

    <span className="text-sm text-gray-600">
      Editing contact
    </span>

    <div className="flex gap-3">

      <button
        onClick={handleCancel}
        className="px-6 py-2 rounded border"
      >
        Cancel
      </button>

      <button
        onClick={handleSave}
        className="bg-black text-white px-6 py-2 rounded"
      >
        Save Changes
      </button>

    </div>

  </div>
)}
    </div>

  )

}
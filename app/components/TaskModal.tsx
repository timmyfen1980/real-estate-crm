'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Task = {
  id: string
  title: string
  due_date: string
  priority: string
  status: string
  assigned_user_id: string | null
  lead_id: string | null
}

type Props = {
  mode: 'create' | 'edit'
  task: Task | null
  onClose: () => void
  onSaved: () => void
  currentUserId: string | null
  isOwner: boolean
  leadId?: string | null
}

export default function TaskModal({
  mode,
  task,
  onClose,
  onSaved,
  currentUserId,
  isOwner,
  leadId,
}: Props) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string }[]>([])

  useEffect(() => {
    if (mode === 'edit' && task) {
      setTitle(task.title)
      setPriority(task.priority as 'low' | 'medium' | 'high')
      setAssignedUserId(task.assigned_user_id || '')
      setSelectedLeadId(task.lead_id || null)
      setDueDate(task.due_date?.slice(0, 10) || '')
    } else {
      setTitle('')
      setPriority('medium')
      setAssignedUserId(currentUserId || '')
      setSelectedLeadId(leadId || null)
      setDueDate(new Date().toISOString().slice(0, 10))
    }
    setError(null)
  }, [mode, task, currentUserId, leadId])
useEffect(() => {
  const loadMembers = async () => {
    try {
      if (!isOwner) return

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data: membership } = await supabase
        .from('account_users')
        .select('account_id')
        .eq('user_id', user.id)
        .single()

      if (!membership?.account_id) return

      const res = await fetch(
        `/api/team-members?accountId=${membership.account_id}`
      )

      const teamMembers = await res.json()

      setTeamMembers(teamMembers || [])
    } catch (err) {
      console.error('TEAM MEMBERS LOAD ERROR:', err)
    }
  }

  loadMembers()
}, [isOwner])
  const handleSave = async () => {
    if (!title.trim()) {
      setError('Task title is required.')
      return
    }

    if (!dueDate) {
      setError('Due date is required.')
      return
    }

    setLoading(true)
    setError(null)

    const payload = {
      title,
      due_date: dueDate,
      priority,
      status: 'pending',
      assigned_user_id: assignedUserId,
      lead_id: selectedLeadId,
      source: 'system',
    }

    if (mode === 'create') {
      const { data } = await supabase
        .from('tasks')
        .insert(payload)
        .select()
        .single()

      if (data?.lead_id) {
        await supabase.from('lead_activity').insert({
          lead_id: data.lead_id,
          user_id: currentUserId,
          type: 'task_created',
          metadata: { title, due_date: dueDate },
        })
      }
    }

    if (mode === 'edit' && task) {
      await supabase
        .from('tasks')
        .update(payload)
        .eq('id', task.id)

      if (task.lead_id) {
        await supabase.from('lead_activity').insert({
          lead_id: task.lead_id,
          user_id: currentUserId,
          type: 'task_updated',
          metadata: { title, due_date: dueDate },
        })
      }
    }

    setLoading(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl p-8 space-y-6">

        <h2 className="text-xl font-semibold">
          {mode === 'create' ? 'Create Task' : 'Edit Task'}
        </h2>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="w-full border rounded-lg px-4 py-3"
        />

        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full border rounded-lg px-4 py-3"
        />

        <select
          value={priority}
          onChange={(e) =>
            setPriority(e.target.value as 'low' | 'medium' | 'high')
          }
          className="w-full border rounded-lg px-4 py-3"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        {isOwner && (
          <select
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            className="w-full border rounded-lg px-4 py-3"
          >
            <option value="">Select Team Member</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={onClose}
            className="px-5 py-2 border rounded-lg"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={loading}
            className="px-5 py-2 bg-black text-white rounded-lg"
          >
            {loading ? 'Saving...' : 'Save Task'}
          </button>
        </div>

      </div>
    </div>
  )
}
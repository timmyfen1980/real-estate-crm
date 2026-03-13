'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useParams, useRouter } from 'next/navigation'

type Lead = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  status: string
}

type Note = {
  id: string
  content: string
  created_at: string
}

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const leadId = params.id as string

  const [lead, setLead] = useState<Lead | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [newNote, setNewNote] = useState('')

  useEffect(() => {
    loadLead()
    loadNotes()
  }, [])

  const loadLead = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      router.push('/')
      return
    }

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
      .single()

    if (!membership) {
      router.push('/leads')
      return
    }

    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('account_id', membership.account_id)
      .single()

    if (!data) {
      router.push('/leads')
      return
    }

    setLead(data)
  }

  const loadNotes = async () => {
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    setNotes(data || [])
  }

  const updateStatus = async (status: string) => {
    await supabase
      .from('leads')
      .update({ status })
      .eq('id', leadId)

    loadLead()
  }

  const addNote = async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    await supabase.from('notes').insert([
      {
        lead_id: leadId,
        user_id: userData.user.id,
        content: newNote,
      },
    ])

    setNewNote('')
    loadNotes()
  }

  if (!lead) return <div className="p-8">Loading...</div>

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <button
        onClick={() => router.push('/leads')}
        className="mb-4 text-blue-600"
      >
        ← Back to Leads
      </button>

      <div className="bg-white p-6 rounded shadow mb-6">
        <h1 className="text-2xl font-bold mb-2">
          {lead.first_name} {lead.last_name}
        </h1>

        <p>Email: {lead.email}</p>
        <p>Phone: {lead.phone}</p>

        <div className="mt-4">
          <label className="font-semibold mr-2">Status:</label>
          <select
            value={lead.status}
            onChange={(e) => updateStatus(e.target.value)}
            className="border p-2 rounded"
          >
            <option>New</option>
            <option>Contacted</option>
            <option>Hot</option>
            <option>Cold</option>
            <option>Closed</option>
          </select>
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-4">Notes</h2>

        <div className="mb-4">
          <textarea
            className="w-full border p-2 rounded"
            placeholder="Add a note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <button
            onClick={addNote}
            className="mt-2 bg-black text-white px-4 py-2 rounded"
          >
            Add Note
          </button>
        </div>

        {notes.length === 0 ? (
          <p className="text-gray-500">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="border-b py-2">
              <p>{note.content}</p>
              <p className="text-xs text-gray-400">
                {new Date(note.created_at).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
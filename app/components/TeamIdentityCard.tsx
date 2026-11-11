'use client'

import { useEffect, useState } from 'react'

// Team & Brand settings card (Account page). Everything branded —
// campaign slide footers, the Instagram preview account, email
// signatures — reads from these values (lib/teamIdentity), so this
// card is the ONE place a team sets who they are. Owner-only edits.

type Fields = Record<string, string>

const FIELD_DEFS: { key: string; label: string; hint?: string }[] = [
  { key: 'team_name', label: 'Team Name' },
  { key: 'brokerage_name', label: 'Brokerage Name (full legal)' },
  { key: 'brokerage_address', label: 'Brokerage Address' },
  {
    key: 'info_email',
    label: 'Info Email',
    hint: 'The public team inbox — goes on mass materials.',
  },
  {
    key: 'office_phone',
    label: 'Office Phone',
    hint: 'The number for mass materials — not a personal direct line.',
  },
  { key: 'website_url', label: 'Website' },
  {
    key: 'instagram_handle',
    label: 'Instagram Posting Account',
    hint: 'The account campaign posts go on (no @ needed).',
  },
  {
    key: 'instagram_collabs',
    label: 'Instagram Collaborators',
    hint: 'Comma-separated handles invited as collaborators.',
  },
]

type Person = { userId: string; name: string; title: string; role: string }

export default function TeamIdentityCard() {
  const [loading, setLoading] = useState(true)
  const [fields, setFields] = useState<Fields>({})
  const [people, setPeople] = useState<Person[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [footerPreview, setFooterPreview] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/team-identity')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Could not load settings.')
        setFields(json.fields || {})
        setPeople(json.people || [])
        const t: Record<string, string> = {}
        for (const p of json.people || []) t[p.userId] = p.title
        setTitles(t)
        setFooterPreview(json.footerPreview || '')
        setCanEdit(!!json.canEdit)
      } catch (err: any) {
        setError(err.message || 'Could not load settings.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function save() {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/team-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, titles }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not save.')
      if (json.needsSetup) {
        setMessage(
          'Saved what the system has fields for today. A few newer fields are waiting on a one-time setup — Rea has it ready; nothing else to do here.'
        )
      } else {
        setMessage('Saved. New campaign graphics and previews will use these.')
      }
    } catch (err: any) {
      setError(err.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full border border-black p-3 disabled:bg-gray-50 disabled:text-gray-500'

  return (
    <div className="border border-black p-10 mb-12">
      <h2 className="text-xl font-semibold mb-2">Team &amp; Brand</h2>
      <p className="text-sm text-gray-500 mb-8">
        The one place your team&apos;s identity lives. Campaign footers, the
        Instagram preview, and signatures are all built from these — change
        them here and they change everywhere.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-8 mb-10">
            {FIELD_DEFS.map((f) => (
              <div key={f.key}>
                <label className="text-sm font-medium block mb-2">
                  {f.label}
                </label>
                <input
                  className={inputCls}
                  value={fields[f.key] || ''}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                />
                {f.hint && (
                  <p className="text-xs text-gray-500 mt-2">{f.hint}</p>
                )}
              </div>
            ))}
          </div>

          <p className="text-sm font-semibold mb-4">
            People — names &amp; titles
          </p>
          <div className="mb-10 space-y-4">
            {people.map((p) => (
              <div key={p.userId} className="flex items-center gap-4">
                <span className="w-56 text-sm">{p.name}</span>
                <input
                  className="border border-black p-2 flex-1 disabled:bg-gray-50 disabled:text-gray-500"
                  value={titles[p.userId] || ''}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setTitles((prev) => ({
                      ...prev,
                      [p.userId]: e.target.value,
                    }))
                  }
                  placeholder="Broker / Sales Representative / …"
                />
              </div>
            ))}
          </div>

          {footerPreview && (
            <p className="text-xs text-gray-500 mb-6">
              Campaign footer preview: <em>{footerPreview}</em>
            </p>
          )}

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          {message && <p className="text-sm text-green-700 mb-4">{message}</p>}

          {canEdit ? (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Team & Brand'}
            </button>
          ) : (
            <p className="text-xs text-gray-500">
              Only the account owner can change these.
            </p>
          )}
        </>
      )}
    </div>
  )
}

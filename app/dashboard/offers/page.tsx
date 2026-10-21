'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Offers — every offer package, sorted by address. A package holds all
// the forms for one property (generated or uploaded), each tracked as
// signed or unsigned, so the whole set can go out together when the
// iinked Sign hookup lands.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready for Signature' },
  { value: 'out', label: 'Out for Signature' },
  { value: 'signed', label: 'Signed' },
  { value: 'dead', label: 'Dead' },
]

export default function OffersPage() {
  const [packages, setPackages] = useState<any[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const addTarget = useRef<string>('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/offers/packages')
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Could not load offer packages.')
        return
      }
      setPackages(data.packages || [])
      setTableMissing(!!data.table_missing)
    } catch {
      setError('Could not load offer packages.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const act = async (body: any) => {
    const res = await fetch('/api/offers/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'Action failed')
    return data
  }

  const download = async (pkgId: string, path: string) => {
    try {
      const data = await act({ action: 'file_url', id: pkgId, path })
      window.open(data.url, '_blank')
    } catch (e: any) {
      alert(e.message)
    }
  }

  const setStatus = async (pkg: any, status: string) => {
    setBusyId(pkg.id)
    try {
      await act({ action: 'set_status', id: pkg.id, status })
      setPackages((prev) => prev.map((p) => (p.id === pkg.id ? { ...p, status } : p)))
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusyId('')
    }
  }

  const toggleSigned = async (pkg: any, doc: any) => {
    setBusyId(pkg.id)
    try {
      const data = await act({
        action: 'set_doc_signed',
        id: pkg.id,
        path: doc.path,
        signed: !doc.signed,
      })
      setPackages((prev) =>
        prev.map((p) => (p.id === pkg.id ? { ...p, documents: data.documents } : p))
      )
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusyId('')
    }
  }

  const remove = async (pkg: any) => {
    if (!confirm(`Delete the offer package for ${pkg.address}? Its files go too.`)) return
    setBusyId(pkg.id)
    try {
      await act({ action: 'delete', id: pkg.id })
      setPackages((prev) => prev.filter((p) => p.id !== pkg.id))
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusyId('')
    }
  }

  const onAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const id = addTarget.current
    e.target.value = ''
    if (!file || !id) return
    setBusyId(id)
    try {
      const fd = new FormData()
      fd.append('id', id)
      fd.append('file', file)
      const res = await fetch('/api/offers/packages', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Upload failed')
      setPackages((prev) =>
        prev.map((p) => (p.id === id ? { ...p, documents: data.documents } : p))
      )
    } catch (err: any) {
      alert(err.message)
    } finally {
      setBusyId('')
    }
  }

  const docChip = (pkg: any, doc: any) => (
    <div
      key={doc.path}
      className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white"
    >
      <button
        onClick={() => download(pkg.id, doc.path)}
        className="text-sm text-blue-700 underline text-left"
      >
        {doc.filename}
      </button>
      <button
        onClick={() => toggleSigned(pkg, doc)}
        disabled={busyId === pkg.id}
        className="ml-auto text-xs border rounded-md px-2 py-1 hover:bg-gray-100 transition whitespace-nowrap disabled:opacity-50"
      >
        {doc.signed ? 'Move to unsigned' : 'Mark signed'}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Offers</h1>
            <p className="text-gray-500 mt-1">
              Every offer package, sorted by address — all its forms together, signed and
              unsigned kept apart.
            </p>
          </div>
          <Link
            href="/dashboard/offers/new"
            className="bg-black text-white px-5 py-2.5 rounded-xl hover:bg-gray-800 transition whitespace-nowrap"
          >
            Prepare an Offer
          </Link>
        </div>

        {tableMissing && (
          <div className="border border-amber-300 bg-amber-50 rounded-xl p-5 text-sm text-amber-900">
            Offer-package storage isn't switched on yet. Tim — there's a one-time database
            step (the <span className="font-mono">offer_packages</span> table); Rea has the
            SQL and will walk you through it. Generated PDFs still download fine in the
            meantime.
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-gray-500">Loading…</p>}
        {!loading && !tableMissing && packages.length === 0 && (
          <div className="bg-white rounded-2xl shadow p-10 text-center text-gray-500">
            No offer packages yet. Generate an offer and it will be saved here automatically.
          </div>
        )}

        {packages.map((pkg) => {
          const docs: any[] = Array.isArray(pkg.documents) ? pkg.documents : []
          const unsigned = docs.filter((d) => !d.signed)
          const signed = docs.filter((d) => d.signed)
          return (
            <div key={pkg.id} className="bg-white rounded-2xl shadow p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/dashboard/offers/${pkg.id}`}
                  className="font-semibold text-lg hover:underline"
                >
                  {pkg.address}
                  {pkg.city ? <span className="text-gray-500 font-normal">, {pkg.city}</span> : null}
                </Link>
                {pkg.mls && <span className="text-xs bg-gray-100 rounded-full px-2 py-1">MLS# {pkg.mls}</span>}
                {pkg.partial && (
                  <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-1">
                    Partial draft
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {docs.length} document{docs.length === 1 ? '' : 's'} · {signed.length} signed ·{' '}
                  {new Date(pkg.created_at).toLocaleDateString('en-CA')}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <select
                    className="border rounded-md px-2 py-1.5 text-sm"
                    value={pkg.status}
                    disabled={busyId === pkg.id}
                    onChange={(e) => setStatus(pkg, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => remove(pkg)}
                    disabled={busyId === pkg.id}
                    className="text-sm text-red-600 border border-red-200 rounded-md px-3 py-1.5 hover:bg-red-50 transition disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Unsigned
                  </p>
                  <div className="space-y-2">
                    {unsigned.length === 0 && (
                      <p className="text-sm text-gray-400">Nothing unsigned.</p>
                    )}
                    {unsigned.map((d) => docChip(pkg, d))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Signed
                  </p>
                  <div className="space-y-2">
                    {signed.length === 0 && (
                      <p className="text-sm text-gray-400">Nothing signed yet.</p>
                    )}
                    {signed.map((d) => docChip(pkg, d))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => {
                    addTarget.current = pkg.id
                    fileRef.current?.click()
                  }}
                  disabled={busyId === pkg.id}
                  className="text-sm border px-3 py-1.5 rounded-md hover:bg-gray-100 transition disabled:opacity-50"
                >
                  + Add a form or file
                </button>
                <button
                  disabled
                  title="Connects when the iinked Sign account is linked"
                  className="text-sm border px-3 py-1.5 rounded-md bg-gray-50 text-gray-400 cursor-not-allowed"
                >
                  Send for signature — iinked Sign (coming)
                </button>
              </div>
            </div>
          )
        })}

        <input ref={fileRef} type="file" className="hidden" onChange={onAddFile} />
      </div>
    </div>
  )
}

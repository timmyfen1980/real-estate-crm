'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Offers — every offer package, sorted by address. A package holds all
// the forms for one property (generated or uploaded), each tracked as
// signed or unsigned, so the whole set can go out together when the
// iinked Sign hookup lands.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'Ready for review' },
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
  const [formsFor, setFormsFor] = useState('')
  const [confirmRemove, setConfirmRemove] = useState('')
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({})
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
      // Names for the review queue ("put together by …"): resolve the
      // creators of in-review packages from profiles, fail-quiet — the
      // queue still works without names.
      const creatorIds = Array.from(
        new Set(
          (data.packages || [])
            .filter((p: any) => p.status === 'in_review' && p.created_by)
            .map((p: any) => p.created_by as string)
        )
      )
      if (creatorIds.length > 0) {
        try {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', creatorIds)
          const map: Record<string, string> = {}
          ;(profs || []).forEach((pr: any) => {
            if (pr.full_name) map[pr.id] = pr.full_name
          })
          setCreatorNames(map)
        } catch {
          // names are a nicety only
        }
      }
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

  const removeDoc = async (pkg: any, doc: any) => {
    setBusyId(pkg.id)
    try {
      const data = await act({ action: 'delete_doc', id: pkg.id, path: doc.path })
      setPackages((prev) =>
        prev.map((p) => (p.id === pkg.id ? { ...p, documents: data.documents } : p))
      )
      setConfirmRemove('')
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

  // "Add from the team library" (Tim, 2026-10-22): NOT the team
  // documents list — this opens the same later-stage forms picker as
  // "Add from Library" inside the package (124 / 123 / 120 / 161).
  // Picking one deep-links into the package at that form.
  const toggleForms = (pkg: any) => {
    setFormsFor((prev) => (prev === pkg.id ? '' : pkg.id))
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
      <button
        onClick={() => {
          const key = `${pkg.id}|${doc.path}`
          if (confirmRemove !== key) {
            setConfirmRemove(key)
            return
          }
          removeDoc(pkg, doc)
        }}
        disabled={busyId === pkg.id}
        className={
          confirmRemove === `${pkg.id}|${doc.path}`
            ? 'text-xs border border-red-300 bg-red-50 text-red-700 rounded-md px-2 py-1 transition whitespace-nowrap disabled:opacity-50'
            : 'text-xs border rounded-md px-2 py-1 text-gray-500 hover:bg-red-50 hover:text-red-700 transition whitespace-nowrap disabled:opacity-50'
        }
      >
        {confirmRemove === `${pkg.id}|${doc.path}` ? 'Sure? Remove it' : 'Remove'}
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
            No offer packages yet — use Prepare an Offer (top right) to start one, and it
            will be saved here automatically.
          </div>
        )}

        {/* READY FOR REVIEW — the handoff queue (Tim, 2026-10-23): Beth
            assembles a package, sets it "Ready for review", and it waits
            here for Tim or Aidan to check before anything moves on to
            Ready for Signature. Longest-waiting first; hidden when empty. */}
        {(() => {
          const reviewPkgs = packages
            .filter((p) => p.status === 'in_review')
            .slice()
            .sort((a, b) =>
              String(a.updated_at || '').localeCompare(String(b.updated_at || ''))
            )
          if (reviewPkgs.length === 0) return null
          return (
            <div className="bg-white rounded-2xl shadow p-6 space-y-3 border-2 border-blue-200">
              <h2 className="font-semibold text-lg">
                Ready for review{' '}
                <span className="text-sm font-normal text-gray-500">
                  ({reviewPkgs.length} waiting)
                </span>
              </h2>
              <p className="text-sm text-gray-500">
                Assembled and finished — waiting for Tim or Aidan to check before anything
                goes out.
              </p>
              <div className="divide-y divide-gray-100">
                {reviewPkgs.map((pkg) => (
                  <div key={pkg.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Link
                      href={`/dashboard/offers/${pkg.id}`}
                      className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-600"
                    >
                      {pkg.address}
                      {pkg.city ? (
                        <span className="text-gray-500 font-normal">, {pkg.city}</span>
                      ) : null}
                    </Link>
                    {pkg.created_by && creatorNames[pkg.created_by] && (
                      <span className="text-xs text-gray-500">
                        Put together by {creatorNames[pkg.created_by].split(' ')[0]}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      Updated{' '}
                      {new Date(pkg.updated_at || pkg.created_at).toLocaleDateString('en-CA')}
                    </span>
                    <Link
                      href={`/dashboard/offers/${pkg.id}`}
                      className="ml-auto text-sm font-medium border border-black px-3 py-1.5 rounded-md hover:bg-black hover:text-white transition"
                    >
                      Open package →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {packages.map((pkg) => {
          const docs: any[] = Array.isArray(pkg.documents) ? pkg.documents : []
          const unsigned = docs.filter((d) => !d.signed)
          const signed = docs.filter((d) => d.signed)
          return (
            <div key={pkg.id} className="bg-white rounded-2xl shadow p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/dashboard/offers/${pkg.id}`}
                  className="font-semibold text-lg text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-600"
                >
                  {pkg.address}
                  {pkg.city ? <span className="text-gray-500 font-normal">, {pkg.city}</span> : null}
                </Link>
                {pkg.mls && <span className="text-xs bg-gray-100 rounded-full px-2 py-1">MLS# {pkg.mls}</span>}
                {pkg.partial && (
                  <span
                    className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-1"
                    title="Some answers are still missing — open the package to finish them"
                  >
                    Partial draft
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {docs.length} document{docs.length === 1 ? '' : 's'} · {signed.length} signed ·{' '}
                  {new Date(pkg.created_at).toLocaleDateString('en-CA')}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-gray-400">Status</span>
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
                <Link
                  href={`/dashboard/offers/${pkg.id}`}
                  className="text-sm font-medium border border-black px-3 py-1.5 rounded-md hover:bg-black hover:text-white transition"
                >
                  Open package →
                </Link>
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
                  onClick={() => toggleForms(pkg)}
                  disabled={busyId === pkg.id}
                  className="text-sm border px-3 py-1.5 rounded-md hover:bg-gray-100 transition disabled:opacity-50"
                >
                  + Add from the team library
                </button>
                {(pkg.documents || []).length > 0 && (
                  <button
                    onClick={() =>
                      window.open(`/api/offers/packages?id=${pkg.id}&download_all=1`, '_blank')
                    }
                    className="text-sm border px-3 py-1.5 rounded-md hover:bg-gray-100 transition"
                  >
                    Download all (.zip)
                  </button>
                )}
                <button
                  disabled
                  title="Connects when the iinked Sign account is linked"
                  className="text-sm border px-3 py-1.5 rounded-md bg-gray-50 text-gray-400 cursor-not-allowed"
                >
                  Send for signature — iinked Sign (coming)
                </button>
              </div>

              {formsFor === pkg.id && (
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Later-stage forms — pick one to complete it inside this package
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['nof', '124', 'Notice of Fulfillment — Form 124'],
                        ['waiver', '123', 'Waiver — Form 123'],
                        ['amend', '120', 'Amendment — Form 120'],
                        ['disclosure', '161', 'Disclosure of Interest — Form 161'],
                      ] as const
                    ).map(([hash, code, label]) => (
                      <Link
                        key={hash}
                        href={`/dashboard/offers/${pkg.id}#${hash}`}
                        className="text-sm border bg-white rounded-md px-2.5 py-1.5 hover:bg-gray-100 transition"
                      >
                        {label}
                        {docs.some((d) => d.form === code) ? ' ✓ in package' : ''}
                      </Link>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    The same four forms as “Add from Library” inside the package — completed
                    after the offer is signed, and each can be sent for signature on its own.
                  </p>
                </div>
              )}
            </div>
          )
        })}

        <input ref={fileRef} type="file" className="hidden" onChange={onAddFile} />
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Deal = {
  id: string
  contact_id: string
  property_id: string
  assigned_user_id: string
  deal_type: string
  status: string
  closing_date: string | null
}

type Contact = {
  id: string
  first_name: string
  last_name: string
}

type Property = {
  id: string
  address: string
}

type Profile = {
  id: string
  full_name: string
}

export default function DealDetailPage() {
  const params = useParams()
  const router = useRouter()
  const dealId = params.id as string

  const [deal, setDeal] = useState<Deal | null>(null)
  const [contact, setContact] = useState<Contact | null>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])

  const [status, setStatus] = useState('')
  const [closingDate, setClosingDate] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [saving, setSaving] = useState(false)

  // Documents section (Tim, 2026-10-22): everything for this deal in
  // one spot — linked offer packages (signed replaces unsigned),
  // client checklist documents (FINTRAC, ID), and direct uploads.
  const [accountId, setAccountId] = useState('')
  const [docPkgs, setDocPkgs] = useState<any[]>([])
  const [clientDocGroups, setClientDocGroups] = useState<any[]>([])
  const [dealDocs, setDealDocs] = useState<any[]>([])
  const [docsSetupNote, setDocsSetupNote] = useState('')
  const [dealDocSection, setDealDocSection] = useState('Deposit')
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const dealFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadDeal()
  }, [])

  const loadDeal = async () => {
    const { data: dealData } = await supabase
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .single()

    if (!dealData) return

    setDeal(dealData)
    setStatus(dealData.status)
    setClosingDate(dealData.closing_date || '')
    setAssignedUserId(dealData.assigned_user_id)

    const { data: contactData } = await supabase
      .from('contacts')
      .select('id, first_name, last_name')
      .eq('id', dealData.contact_id)
      .single()

    setContact(contactData)

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, address')
      .eq('id', dealData.property_id)
      .single()

    setProperty(propertyData)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
      .single()

    if (!membership) return

    setAccountId(membership.account_id)

    const res = await fetch(`/api/team-members?accountId=${membership.account_id}`)
    const team = await res.json()

    setProfiles(team || [])

    void loadDocuments(dealId, membership.account_id)
  }

  const loadDocuments = async (dId: string, accId: string) => {
    // Offer packages linked to this deal. Needs the deal_id column
    // (one-time SQL) — until then, show a note instead of breaking.
    const { data: pkgs, error: pkgErr } = await supabase
      .from('offer_packages')
      .select('id,address,city,status,documents')
      .eq('deal_id', dId)
      .order('created_at', { ascending: true })

    if (pkgErr) {
      if (String(pkgErr.message || '').includes('deal_id')) {
        setDocsSetupNote(
          'Deal linking isn’t switched on yet — there’s a one-time database step (Rea has the SQL). Once it’s run, packages linked to this deal show their documents here automatically.'
        )
      }
    } else {
      setDocPkgs(pkgs || [])
    }

    // Client checklist files linked to this deal (FINTRAC, ID, …).
    const { data: files } = await supabase
      .from('client_files')
      .select('id,client_names,checklist_types')
      .eq('crm_deal_id', dId)

    if (files && files.length) {
      const groups: any[] = []
      for (const f of files) {
        const { data: docs } = await supabase
          .from('client_documents')
          .select('*')
          .eq('client_file_id', f.id)
          .order('stage_index')
          .order('doc_index')

        // Portal uploads store a storage path in file_url; resolve
        // those to signed URLs the same way the checklist page does.
        const resolved = await Promise.all(
          (docs || []).map(async (doc: any) => {
            if (!doc.file_url || doc.file_url.startsWith('http')) return doc
            try {
              const res = await fetch(
                `/api/client-doc-url?path=${encodeURIComponent(doc.file_url)}`
              )
              if (!res.ok) return doc
              const body = await res.json()
              return body.url ? { ...doc, file_url: body.url } : doc
            } catch {
              return doc
            }
          })
        )
        groups.push({ file: f, docs: resolved })
      }
      setClientDocGroups(groups)
    }

    // Documents added directly to this deal.
    const { data: dd } = await supabase
      .from('deal_documents')
      .select('*')
      .eq('deal_id', dId)
      .order('created_at', { ascending: true })

    setDealDocs(dd || [])
  }

  const downloadPkgDoc = async (pkgId: string, path: string) => {
    try {
      const res = await fetch('/api/offers/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'file_url', id: pkgId, path }),
      })
      const data = await res.json()
      if (data.ok && data.url) window.open(data.url, '_blank')
      else alert(data.error || 'Could not open that document.')
    } catch {
      alert('Could not open that document.')
    }
  }

  const openDealDoc = async (path: string) => {
    const { data } = await supabase.storage
      .from('client-documents')
      .createSignedUrl(path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const onDealDocUpload = async (e: any) => {
    const file = e.target.files?.[0] as File | undefined
    e.target.value = ''
    if (!file || !deal) return
    setUploadingDoc(true)
    try {
      const safe = file.name.replace(/[^\w.\- ]+/g, '_')
      const path = `deal-files/${deal.id}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage
        .from('client-documents')
        .upload(path, file)
      if (upErr) throw upErr
      const { error: insErr } = await supabase.from('deal_documents').insert([
        {
          account_id: accountId,
          deal_id: deal.id,
          filename: safe,
          path,
          section: dealDocSection,
        },
      ])
      if (insErr) throw insErr
      await loadDocuments(deal.id, accountId)
    } catch (err: any) {
      if (String(err?.message || '').includes('deal_documents')) {
        alert('Adding documents to a deal needs the one-time database step first — Rea has the SQL.')
      } else {
        alert(`Upload failed: ${err?.message || 'please try again.'}`)
      }
    } finally {
      setUploadingDoc(false)
    }
  }

  const handleSave = async () => {
    if (!deal) return

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id')
      .eq('user_id', userData.user.id)
      .single()

    if (!membership) return

    const { error } = await supabase
      .from('deals')
      .update({
        status,
        assigned_user_id: assignedUserId,
        closing_date: closingDate || null
      })
      .eq('id', deal.id)
      .eq('account_id', membership.account_id)
// 🔥 AUTO-SYNC PROPERTY STATUS (SELLER DEALS ONLY)

if (!error && deal.deal_type === 'Seller') {

  let newPropertyStatus = ''

  if (status === 'Active') {
    newPropertyStatus = 'for_sale'
  }

  if (status === 'Sold Conditional' || status === 'Sold Firm') {
    newPropertyStatus = 'sold'
  }

  if (status === 'Closed') {
    newPropertyStatus = 'closed'
  }

  if (newPropertyStatus && deal.property_id) {
    // Sync the property status — if this fails, tell Tim instead of silently
    // leaving the property list stale; keep him on the page so he can retry.
    const { error: syncError } = await supabase
      .from('properties')
      .update({
        status: newPropertyStatus
      })
      .eq('id', deal.property_id)
      .eq('account_id', membership.account_id)

    if (syncError) {
      console.log('PROPERTY SYNC ERROR:', syncError)
      alert('Deal saved, but the property status could not be synced. Please update the property manually.')
      setSaving(false)
      return
    }
  }
}
    if (error) {
      console.log('DEAL UPDATE ERROR:', error)
      alert('Failed to save deal')
      setSaving(false)
      return
    }

    router.push('/dashboard/deals')
  }

  if (!deal) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading deal...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-10 flex justify-center">

      <div className="bg-white w-full max-w-5xl rounded-xl shadow p-10 space-y-8">

        <h1 className="text-2xl font-semibold">Edit Deal</h1>

        {/* TOP SECTION */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* CONTACT */}

          <div className="border rounded p-4 bg-gray-50">

            <p className="text-xs text-gray-500 mb-1">Contact</p>

            <button
              onClick={() => router.push(`/dashboard/contacts/${contact?.id}`)}
              className="text-lg font-medium text-blue-600 hover:underline"
            >
              {contact ? `${contact.first_name} ${contact.last_name}` : '-'}
            </button>

          </div>

          {/* PROPERTY */}

          <div className="border rounded p-4 bg-gray-50">

            <p className="text-xs text-gray-500 mb-1">Property</p>

            <button
              onClick={() => router.push(`/dashboard/properties/${property?.id}`)}
              className="text-lg font-medium text-blue-600 hover:underline"
            >
              {property?.address || '-'}
            </button>

          </div>

        </div>

        {/* DEAL DETAILS */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* DEAL TYPE */}

          <div>
            <label className="text-sm font-medium block mb-2">Deal Type</label>
            <div className="border p-3 rounded bg-gray-50">
              {deal.deal_type}
            </div>
          </div>

          {/* STATUS */}

          <div>
            <label className="text-sm font-medium block mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border p-3 rounded"
            >
              <option value="Active">Active</option>
              <option value="Sold Conditional">Sold Conditional</option>
              <option value="Sold Firm">Sold Firm</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          {/* ASSIGNED AGENT */}

          <div>
            <label className="text-sm font-medium block mb-2">Assigned Agent</label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="w-full border p-3 rounded"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* CLOSING DATE */}

          <div>
            <label className="text-sm font-medium block mb-2">Closing Date</label>
            <input
              type="date"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
              className="w-full border p-3 rounded"
            />
          </div>

        </div>

        {/* DOCUMENTS */}

        <div className="border rounded p-4 space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Documents</h2>
            <p className="text-sm text-gray-500">
              Everything for this deal in one spot — the offer package, the clients’
              compliance documents, and anything added here. When a signed copy arrives,
              it replaces the unsigned one as the copy of record.
            </p>
            {docsSetupNote && <p className="text-sm text-amber-700 mt-2">{docsSetupNote}</p>}
          </div>

          {docPkgs.map((pkg) => {
            const docs: any[] = Array.isArray(pkg.documents) ? pkg.documents : []
            const signedDocs = docs.filter(
              (d) => d.signed || d.form === 'signed' || d.form === 'cac'
            )
            const unsignedDocs = docs.filter(
              (d) => !(d.signed || d.form === 'signed' || d.form === 'cac')
            )
            const main = signedDocs.length ? signedDocs : unsignedDocs
            const docRow = (d: any, signedGroup: boolean) => (
              <div
                key={d.path}
                className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white"
              >
                <button
                  onClick={() => downloadPkgDoc(pkg.id, d.path)}
                  className="text-sm text-blue-700 underline text-left"
                >
                  {d.filename}
                </button>
                <span
                  className={`ml-auto text-xs rounded-full px-2 py-0.5 whitespace-nowrap ${
                    signedGroup
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {d.form === 'cac'
                    ? 'Signing certificate'
                    : signedGroup
                      ? 'Signed'
                      : 'Unsigned'}
                </span>
              </div>
            )
            return (
              <div key={pkg.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">
                    Offer package — {pkg.address}
                    {pkg.city ? `, ${pkg.city}` : ''}
                  </p>
                  <span className="text-xs text-gray-400 capitalize">{pkg.status}</span>
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={() => router.push(`/dashboard/offers/${pkg.id}`)}
                      className="text-xs border rounded-md px-2 py-1 hover:bg-gray-100"
                    >
                      Open package
                    </button>
                    <button
                      onClick={() =>
                        window.open(
                          `/api/offers/packages?id=${pkg.id}&download_all=1`,
                          '_blank'
                        )
                      }
                      className="text-xs border rounded-md px-2 py-1 hover:bg-gray-100"
                    >
                      Download all (.zip)
                    </button>
                  </div>
                </div>
                {docs.length === 0 && (
                  <p className="text-sm text-gray-400">No documents in this package yet.</p>
                )}
                <div className="space-y-2">
                  {main.map((d) => docRow(d, signedDocs.length > 0))}
                </div>
                {signedDocs.length > 0 && unsignedDocs.length > 0 && (
                  <details>
                    <summary className="text-xs text-gray-400 cursor-pointer">
                      Unsigned originals (superseded) — {unsignedDocs.length}
                    </summary>
                    <div className="space-y-2 mt-2">
                      {unsignedDocs.map((d) => docRow(d, false))}
                    </div>
                  </details>
                )}
              </div>
            )
          })}

          {docPkgs.length === 0 && !docsSetupNote && (
            <p className="text-sm text-gray-400">
              No offer package is linked to this deal yet. Link one from the package
              (Create / Link to Deal) and its documents will appear here automatically.
            </p>
          )}

          {clientDocGroups.map((g) => {
            const received = g.docs.filter((d: any) => d.status === 'received' && d.file_url)
            const pending = g.docs.filter((d: any) => d.status !== 'received')
            return (
              <div key={g.file.id} className="space-y-2">
                <p className="text-sm font-medium">
                  Client documents — {g.file.client_names}{' '}
                  <span className="text-gray-400 font-normal">
                    ({(g.file.checklist_types || []).join(', ')})
                  </span>
                </p>
                {received.length === 0 && (
                  <p className="text-sm text-gray-400">Nothing received yet.</p>
                )}
                <div className="space-y-2">
                  {received.map((d: any) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white"
                    >
                      <a
                        href={d.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-700 underline"
                      >
                        {d.document}
                      </a>
                      <span className="ml-auto text-xs bg-green-100 text-green-800 rounded-full px-2 py-0.5">
                        Received
                      </span>
                    </div>
                  ))}
                </div>
                {pending.length > 0 && (
                  <p className="text-xs text-gray-400">
                    Still outstanding: {pending.map((d: any) => d.document).join(' · ')}
                  </p>
                )}
                <button
                  onClick={() => router.push(`/dashboard/checklists/${g.file.id}`)}
                  className="text-xs border rounded-md px-2 py-1 hover:bg-gray-100"
                >
                  Open checklist
                </button>
              </div>
            )
          })}

          <div className="space-y-2">
            <p className="text-sm font-medium">Added to this deal</p>
            {dealDocs.length === 0 && (
              <p className="text-sm text-gray-400">
                Nothing added yet — deposit receipts and closing documents go here.
              </p>
            )}
            <div className="space-y-2">
              {dealDocs.map((d: any) => (
                <div
                  key={d.id}
                  className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white"
                >
                  <button
                    onClick={() => openDealDoc(d.path)}
                    className="text-sm text-blue-700 underline text-left"
                  >
                    {d.filename}
                  </button>
                  <span className="ml-auto text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                    {d.section}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                className="border rounded-md px-2 py-1.5 text-sm"
                value={dealDocSection}
                onChange={(e) => setDealDocSection(e.target.value)}
              >
                <option value="Deposit">Deposit</option>
                <option value="Closing">Closing</option>
                <option value="Legal">Legal</option>
                <option value="Other">Other</option>
              </select>
              <button
                onClick={() => dealFileRef.current?.click()}
                disabled={uploadingDoc}
                className="text-sm border px-3 py-1.5 rounded-md hover:bg-gray-100 transition disabled:opacity-50"
              >
                {uploadingDoc ? 'Adding…' : '+ Add a document'}
              </button>
              <input
                ref={dealFileRef}
                type="file"
                className="hidden"
                onChange={onDealDocUpload}
              />
            </div>
          </div>
        </div>

        {/* SAVE */}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-black text-white py-3 rounded-md hover:bg-gray-800"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

      </div>

    </div>
  )
}
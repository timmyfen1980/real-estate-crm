'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Prepare an Offer — step 1. Just the general questions: the property
// (address, with MLS prefill + listing-sheet upload) and the buyers
// (linked to a client when there is one — they have usually already
// signed a buyer rep agreement). Creates the offer package, then hands
// off to the package workspace where the forms live as tabs.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const inputCls = 'w-full border p-3 rounded-md'
const labelCls = 'block text-sm font-medium mb-1'
const h2Cls = 'text-lg font-semibold'
const sectionCls = 'space-y-4 border-t pt-8'

export default function StartOfferPage() {
  const router = useRouter()

  // Client link
  const [clientQuery, setClientQuery] = useState('')
  const [clientMatches, setClientMatches] = useState<any[]>([])
  const [client, setClient] = useState<any>(null)
  // The name the picker itself last placed in the buyer boxes — a
  // re-pick replaces that name (correcting a wrong pick just works),
  // while anything typed or edited by hand is never overwritten.
  const [clientFilledName, setClientFilledName] = useState('')
  const clientTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Buyers / sellers (sellers usually arrive from the listing sheet)
  const [buyers, setBuyers] = useState<string[]>(['', '', '', ''])
  const [sellers, setSellers] = useState<string[]>(['', '', '', ''])
  const setBuyerAt = (i: number, v: string) =>
    setBuyers((prev) => prev.map((x, j) => (j === i ? v : x)))
  const setSellerAt = (i: number, v: string) =>
    setSellers((prev) => prev.map((x, j) => (j === i ? v : x)))

  // Property (seeded by prefill / sheet)
  const [lookup, setLookup] = useState('')
  const [prefilling, setPrefilling] = useState(false)
  const [prefillNote, setPrefillNote] = useState('')
  const [candidates, setCandidates] = useState<any[]>([])
  const [pickedMls, setPickedMls] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [legalDescription, setLegalDescription] = useState('')
  const [pin, setPin] = useState('')
  const [frontage, setFrontage] = useState('')
  const [depth, setDepth] = useState('')
  const [frontageUnit, setFrontageUnit] = useState('feet')
  const [depthUnit, setDepthUnit] = useState('feet')
  const [frontageSide, setFrontageSide] = useState('')
  const [frontageStreet, setFrontageStreet] = useState('')
  const [chattelsText, setChattelsText] = useState('')
  const [exclusionsText, setExclusionsText] = useState('')
  const [listingBrokerage, setListingBrokerage] = useState('')
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sheet upload
  const [sheetBusy, setSheetBusy] = useState(false)
  const [sheetNote, setSheetNote] = useState('')

  // Create
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const onClientQuery = (v: string) => {
    setClientQuery(v)
    setClient(null)
    if (clientTimer.current) clearTimeout(clientTimer.current)
    if (v.trim().length < 2) {
      setClientMatches([])
      return
    }
    clientTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/offers/clients?q=${encodeURIComponent(v.trim())}`)
        const data = await res.json()
        if (data.ok) setClientMatches(data.clients || [])
      } catch {
        /* picker is a convenience */
      }
    }, 300)
  }

  const pickClient = (c: any) => {
    setClient(c)
    setClientMatches([])
    setClientQuery(c.name)
    const next = [...buyers]
    // Drop the name the picker itself placed earlier, wherever it
    // sits — but only if it's still exactly that name (a hand edit
    // of it is the agent's name now, and stays).
    if (clientFilledName) {
      const at = next.indexOf(clientFilledName)
      if (at !== -1) next[at] = ''
    }
    if (!next[0].trim()) {
      next[0] = c.name
      setClientFilledName(c.name)
    } else {
      const slot = next.findIndex((b) => !b.trim())
      if (slot === -1) {
        // All four boxes hold hand-typed names — leave them; the
        // client link itself is still recorded on the package.
        setClientFilledName('')
      } else {
        next[slot] = c.name
        setClientFilledName(c.name)
      }
    }
    setBuyers(next)
  }

  const applyPrefill = (p: any, source: string) => {
    if (p.address) setAddress(p.address)
    if (p.city) setCity(p.city)
    if (p.legal_description) setLegalDescription(p.legal_description)
    if (p.pin) setPin(String(p.pin))
    if (p.frontage) setFrontage(String(p.frontage))
    if (p.depth) setDepth(String(p.depth))
    if (p.chattels) setChattelsText(String(p.chattels))
    if (p.exclusions) setExclusionsText(String(p.exclusions))
    if (p.listing_brokerage) setListingBrokerage(String(p.listing_brokerage))
    if (p.street_name) setFrontageStreet((prev) => prev || String(p.street_name))
    if (p.street_side) setFrontageSide((prev) => prev || String(p.street_side))
    setCandidates([])
    const listed = p.list_price
      ? ` Listed at $${Number(p.list_price).toLocaleString()} — the offer price gets set inside the package.`
      : ''
    setPrefillNote(
      (source === 'DLA'
        ? 'Filled from the DLA back-office feed.'
        : 'Filled the basics from the listing feed.') + listed
    )
  }

  const runPrefill = async () => {
    const q = lookup.trim()
    if (!q) return
    setPrefilling(true)
    setPrefillNote('')
    try {
      const looksLikeKey = !/\s/.test(q)
      const res = await fetch('/api/offers/prefill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(looksLikeKey ? { mls: q } : { query: q }),
      })
      const data = await res.json()
      if (!data.ok) {
        setPrefillNote(data.error || 'Nothing found — just type the address below.')
        return
      }
      if (data.candidates) {
        setCandidates(data.candidates)
        setPrefillNote('Found these — pick the right property:')
        return
      }
      if (looksLikeKey) setPickedMls(q.toUpperCase())
      applyPrefill(data.prefill || {}, data.source)
    } catch {
      setPrefillNote('Lookup failed — just type the address below.')
    } finally {
      setPrefilling(false)
    }
  }

  const pickCandidate = async (key: string) => {
    setPrefilling(true)
    setPickedMls(key)
    try {
      const res = await fetch('/api/offers/prefill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mls: key }),
      })
      const data = await res.json()
      if (!data.ok) {
        setPrefillNote(data.error || 'Prefill failed — type the address below.')
        return
      }
      applyPrefill(data.prefill || {}, data.source)
    } catch {
      setPrefillNote('Prefill failed — type the address below.')
    } finally {
      setPrefilling(false)
    }
  }

  const onLookupChange = (v: string) => {
    setLookup(v)
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    const q = v.trim()
    if (q.length < 3 || !/\s/.test(q)) {
      setCandidates([])
      return
    }
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/offers/prefill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suggest: q }),
        })
        const data = await res.json()
        if (data.ok && Array.isArray(data.candidates)) setCandidates(data.candidates)
      } catch {
        /* suggestions are a convenience */
      }
    }, 350)
  }

  const onSheetUpload = async (file: File | null) => {
    if (!file) return
    setSheetBusy(true)
    setSheetNote('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/offers/listing-extract', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.ok) {
        setSheetNote(data.error || "Couldn't read that sheet.")
        return
      }
      const f = data.fields || {}
      const filled: string[] = []
      const blank = (cur: string, val: any, setter: (v: string) => void, label: string) => {
        if (!cur.trim() && val !== undefined && val !== null && String(val).trim()) {
          setter(String(val))
          filled.push(label)
        }
      }
      if (Array.isArray(f.seller_names) && f.seller_names.length) {
        setSellers((prev) => {
          const next = [...prev]
          let used = false
          for (const name of f.seller_names) {
            const slot = next.findIndex((x) => !x.trim())
            if (slot === -1) break
            next[slot] = String(name)
            used = true
          }
          if (used) filled.push('seller names')
          return next
        })
      }
      blank(address, f.address, setAddress, 'address')
      blank(legalDescription, f.legal_description, setLegalDescription, 'legal description')
      blank(pin, f.pin, setPin, 'PIN')
      if (!frontage.trim() && f.frontage) {
        setFrontage(String(f.frontage))
        if (f.frontage_unit === 'metres' || f.frontage_unit === 'meters') setFrontageUnit('metres')
        filled.push('frontage')
      }
      if (!depth.trim() && f.depth) {
        setDepth(String(f.depth))
        if (f.depth_unit === 'metres' || f.depth_unit === 'meters') setDepthUnit('metres')
        filled.push('depth')
      }
      blank(chattelsText, f.chattels_inclusions, setChattelsText, 'inclusions')
      blank(exclusionsText, f.exclusions, setExclusionsText, 'exclusions')
      blank(listingBrokerage, f.listing_brokerage, setListingBrokerage, 'listing brokerage')
      setSheetNote(
        filled.length
          ? `From the sheet: ${filled.join(', ')}. It all carries into the package.`
          : 'Read the sheet — nothing new for the package start.'
      )
    } catch {
      setSheetNote("Couldn't read that sheet — try again.")
    } finally {
      setSheetBusy(false)
    }
  }

  const lines = (t: string) =>
    t.split('\n').map((s) => s.trim()).filter(Boolean)

  const createPackage = async () => {
    setCreating(true)
    setCreateError('')
    try {
      const deal = {
        buyers: buyers.map((s) => s.trim()).filter(Boolean),
        sellers: sellers.map((s) => s.trim()).filter(Boolean),
        property: {
          address,
          city,
          legal_description: legalDescription || undefined,
          pin: pin || undefined,
          frontage: frontage ? `${frontage} ${frontageUnit}` : undefined,
          depth: depth ? `${depth} ${depthUnit}` : undefined,
          frontage_side: frontageSide || undefined,
          frontage_street: frontageStreet || undefined,
          mls: pickedMls || undefined,
        },
        chattels: lines(chattelsText),
        exclusions: lines(exclusionsText),
        listing_brokerage: listingBrokerage ? { brokerage: listingBrokerage } : undefined,
        client: client
          ? {
              contact_id: client.contact_id,
              client_file_id: client.client_file_id,
              name: client.name,
              email: client.email,
              checklist_types: client.checklist_types,
            }
          : undefined,
      }
      const res = await fetch('/api/offers/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', deal }),
      })
      const data = await res.json()
      if (!data.ok) {
        setCreateError(data.error || 'Could not create the package.')
        return
      }
      router.push(`/dashboard/offers/${data.id}`)
    } catch {
      setCreateError('Could not create the package — please try again.')
    } finally {
      setCreating(false)
    }
  }

  const canCreate = address.trim().length > 0

  return (
    <div className="min-h-screen bg-gray-100 p-10 flex justify-center">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-lg p-10 space-y-10">
        <div>
          <h1 className="text-2xl font-bold">Prepare an Offer</h1>
          <p className="text-gray-500 mt-1">
            Start with the two general questions — the property, and your buyers. That creates
            the offer package; the forms (100, 801, Confirmation) live inside it as tabs.
          </p>
        </div>

        {/* PROPERTY */}
        <div className={sectionCls} style={{ borderTop: 'none', paddingTop: 0 }}>
          <h2 className={h2Cls}>The property</h2>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Start typing an address, or paste an MLS#…"
              value={lookup}
              onChange={(e) => onLookupChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runPrefill()
              }}
            />
            <button
              onClick={runPrefill}
              disabled={prefilling}
              className="bg-black text-white px-4 rounded-md hover:bg-gray-800 transition disabled:opacity-50 whitespace-nowrap"
            >
              {prefilling ? 'Looking…' : 'Look up'}
            </button>
          </div>
          {prefillNote && <p className="text-sm text-gray-600">{prefillNote}</p>}
          {candidates.length > 0 && (
            <div className="space-y-2">
              {candidates.map((c) => (
                <button
                  key={c.key}
                  onClick={() => pickCandidate(c.key)}
                  className="w-full text-left border rounded-lg px-4 py-3 hover:bg-gray-50 transition"
                >
                  <span className="font-medium">{c.address}</span>
                  {c.city ? <span className="text-gray-500">, {c.city}</span> : null}
                  <span className="text-gray-500">
                    {' '}
                    · {c.price ? `$${Number(c.price).toLocaleString()} · ` : ''}MLS# {c.key}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Address</label>
              <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <div className="border-t pt-4">
            <p className="text-sm text-gray-600">
              …or upload the MLS listing sheet (PDF or photo) and I'll carry what's on it into
              the package — seller names included, if they're printed.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <label className="text-sm border px-3 py-2 rounded-md hover:bg-gray-100 transition cursor-pointer whitespace-nowrap">
                {sheetBusy ? 'Reading…' : 'Upload listing sheet'}
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  disabled={sheetBusy}
                  onChange={(e) => {
                    onSheetUpload(e.target.files?.[0] || null)
                    e.target.value = ''
                  }}
                />
              </label>
              {sheetNote && <span className="text-sm text-gray-600">{sheetNote}</span>}
            </div>
          </div>
        </div>

        {/* WHO */}
        <div className={sectionCls}>
          <h2 className={h2Cls}>Your buyers</h2>
          <div>
            <label className={labelCls}>Link a client (optional)</label>
            <input
              className={inputCls}
              placeholder="Search your contacts — they may already have a client file and a signed buyer rep…"
              value={clientQuery}
              onChange={(e) => onClientQuery(e.target.value)}
            />
            {clientMatches.length > 0 && (
              <div className="space-y-2 mt-2">
                {clientMatches.map((c) => (
                  <button
                    key={c.contact_id}
                    onClick={() => pickClient(c)}
                    className="w-full text-left border rounded-lg px-4 py-3 hover:bg-gray-50 transition"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-gray-500">
                      {c.email ? ` · ${c.email}` : ''}
                      {c.client_file_id
                        ? ` · client file on record (${(c.checklist_types || []).join(', ') || 'portal'})`
                        : ' · no client file yet'}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {client && (
              <p className="text-sm text-gray-600 mt-2">
                Linked: <span className="font-medium">{client.name}</span>
                {client.client_file_id
                  ? ' — their signed rep agreement and ID live in their client file and can join the package.'
                  : ' — no client file yet; one can be started from the portal.'}
              </p>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className={labelCls}>Buyer legal names</label>
              {buyers.map((b, i) => (
                <input
                  key={i}
                  className={inputCls}
                  placeholder={`Buyer ${i + 1}`}
                  value={b}
                  onChange={(e) => setBuyerAt(i, e.target.value)}
                />
              ))}
            </div>
            <div className="space-y-2">
              <label className={labelCls}>Seller legal names (if you have them)</label>
              {sellers.map((s, i) => (
                <input
                  key={i}
                  className={inputCls}
                  placeholder={`Seller ${i + 1}`}
                  value={s}
                  onChange={(e) => setSellerAt(i, e.target.value)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* CREATE */}
        <div className="space-y-3">
          <button
            onClick={createPackage}
            disabled={creating || !canCreate}
            className="w-full bg-black text-white py-3 rounded-xl hover:bg-gray-800 transition disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create the offer package →'}
          </button>
          {!canCreate && (
            <p className="text-sm text-gray-500">
              All the package needs to start is the property address — everything else can be
              filled in inside.
            </p>
          )}
          {createError && <p className="text-sm text-red-600">{createError}</p>}
        </div>
      </div>
    </div>
  )
}

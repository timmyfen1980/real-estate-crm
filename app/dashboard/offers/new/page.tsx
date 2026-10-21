'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Prepare an Offer — the offer workspace. Walks the intake on one page,
// pre-fills from an MLS# lookup when it can, lets the agent pick clauses
// from Tim's library (the Standard Offer Clauses always go in), and
// generates EDITABLE Form 100 + Form 801 PDFs via /api/offers/generate.

import { useRef, useState } from 'react'
import library from '@/lib/clauseLibrary.json'

const LIB = library as any
const BROKERAGE = 'RE/MAX Hallmark First Group Realty Ltd.'
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function todayToronto(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

function splitDate(iso: string) {
  if (!iso) return { day: '', month: '', year: '' }
  const [y, m, d] = iso.split('-')
  return {
    day: d || '',
    month: MONTHS[Number(m) - 1] || '',
    year: (y || '').slice(2),
  }
}

function lines(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const inputCls = 'w-full border p-3 rounded-md'
const labelCls = 'text-sm font-medium'
const sectionCls = 'space-y-4'
const h2Cls = 'text-lg font-semibold'

export default function PrepareOfferPage() {
  // MLS prefill
  const [mls, setMls] = useState('')
  const [prefilling, setPrefilling] = useState(false)
  const [prefillNote, setPrefillNote] = useState('')

  // Property
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [legalDescription, setLegalDescription] = useState('')
  const [pin, setPin] = useState('')
  const [frontage, setFrontage] = useState('')
  const [depth, setDepth] = useState('')
  const [frontageSide, setFrontageSide] = useState('')
  const [frontageStreet, setFrontageStreet] = useState('')

  // Parties
  const [buyersText, setBuyersText] = useState('')
  const [sellersText, setSellersText] = useState('')

  // Terms
  const [agreementDate, setAgreementDate] = useState(todayToronto())
  const [price, setPrice] = useState('')
  const [deposit, setDeposit] = useState('')
  const [depositDueKind, setDepositDueKind] = useState('upon_acceptance')
  const [depositDueText, setDepositDueText] = useState('')
  const [depositHolder, setDepositHolder] = useState(BROKERAGE)
  const [irrevocableBy, setIrrevocableBy] = useState('Buyer')
  const [irrevocableTime, setIrrevocableTime] = useState('11:59 p.m.')
  const [irrevocableDate, setIrrevocableDate] = useState(todayToronto())
  const [completionDate, setCompletionDate] = useState('')
  const [titleSearchDate, setTitleSearchDate] = useState('')
  const [hst, setHst] = useState('in_addition')

  // Inclusions
  const [chattelsText, setChattelsText] = useState('')
  const [exclusionsText, setExclusionsText] = useState('')
  const [rentals, setRentals] = useState<{ desc: string; monthly: string }[]>([])

  // Brokerages + submission (Form 801)
  const [listingBrokerage, setListingBrokerage] = useState(BROKERAGE)
  const [listingAgent, setListingAgent] = useState('')
  const [listingPhone, setListingPhone] = useState('')
  const [sellingBrokerage, setSellingBrokerage] = useState(BROKERAGE)
  const [sellingAgent, setSellingAgent] = useState('')
  const [sellingPhone, setSellingPhone] = useState('')
  const [submittedVia, setSubmittedVia] = useState('email')
  const [submittedTime, setSubmittedTime] = useState('')
  const [submittedDate, setSubmittedDate] = useState(todayToronto())

  // Clause details
  const [inspectorName, setInspectorName] = useState('')
  const [inspectionDeadline, setInspectionDeadline] = useState('')
  const [selectedClauses, setSelectedClauses] = useState<string[]>([])
  const [blankValues, setBlankValues] = useState<Record<string, Record<string, string>>>({})
  const [blankArrays, setBlankArrays] = useState<Record<string, string[]>>({})

  // Generation
  const [generating, setGenerating] = useState(false)
  const [missing, setMissing] = useState<string[]>([])
  const [genError, setGenError] = useState('')
  const [results, setResults] = useState<{ filename: string; url: string }[]>([])

  const [candidates, setCandidates] = useState<any[]>([])

  const STANDARD_CHATTELS_TEXT =
    'All existing light fixtures, broadloom where laid. Window coverings, fridge, stove, dishwasher, washer, dryer, air conditioner, furnace and related equipment.'

  const insertStandardChattels = () => {
    setChattelsText((prev) =>
      prev.includes('All existing light fixtures')
        ? prev
        : prev.trim()
          ? `${prev.trim()} ${STANDARD_CHATTELS_TEXT}`
          : STANDARD_CHATTELS_TEXT
    )
  }

  const applyPrefill = (p: any, source: string) => {
    if (p.address) setAddress(p.address)
    if (p.city) setCity(p.city)
    if (p.legal_description) setLegalDescription(p.legal_description)
    if (p.pin) setPin(String(p.pin))
    if (p.frontage) setFrontage(String(p.frontage))
    if (p.depth) setDepth(String(p.depth))
    if (p.list_price) setPrice(String(p.list_price))
    if (p.chattels) setChattelsText(String(p.chattels))
    if (p.exclusions) setExclusionsText(String(p.exclusions))
    if (p.listing_brokerage) setListingBrokerage(String(p.listing_brokerage))
    setCandidates([])
    setPrefillNote(
      source === 'DLA'
        ? 'Filled from the DLA back-office feed. Seller legal names are not in any feed — add them below.'
        : 'Filled the basics from the listing feed. Legal description and lot details are not in the public feed — add them below, plus the seller legal names.'
    )
  }

  const runPrefill = async () => {
    const q = mls.trim()
    if (!q) return
    setPrefilling(true)
    setPrefillNote('')
    setCandidates([])
    try {
      // No spaces = an MLS#; anything else is treated as an address
      // search and comes back as candidates to pick from.
      const looksLikeKey = !/\s/.test(q)
      const res = await fetch('/api/offers/prefill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(looksLikeKey ? { mls: q } : { query: q }),
      })
      const data = await res.json()
      if (!data.ok) {
        setPrefillNote(data.error || 'Prefill failed — fill the form in manually.')
        return
      }
      if (data.candidates) {
        setCandidates(data.candidates)
        setPrefillNote('Found these — pick the right property:')
        return
      }
      applyPrefill(data.prefill || {}, data.source)
    } catch {
      setPrefillNote('Prefill failed — fill the form in manually.')
    } finally {
      setPrefilling(false)
    }
  }

  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestSeq = useRef(0)

  // As-you-type address suggestions from the MLS feed. Debounced, and
  // only the latest response is allowed to land.
  const onLookupChange = (v: string) => {
    setMls(v)
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    const q = v.trim()
    if (q.length < 3) {
      setCandidates([])
      return
    }
    suggestTimer.current = setTimeout(async () => {
      const seq = ++suggestSeq.current
      try {
        const res = await fetch('/api/offers/prefill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suggest: q }),
        })
        const data = await res.json()
        if (seq === suggestSeq.current && data.ok) {
          setCandidates(data.candidates || [])
        }
      } catch {
        // Suggestions are a nicety — the Pre-fill button still works.
      }
    }, 350)
  }

  const pickCandidate = async (key: string) => {
    setPrefilling(true)
    try {
      const res = await fetch('/api/offers/prefill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mls: key }),
      })
      const data = await res.json()
      if (!data.ok) {
        setPrefillNote(data.error || 'Prefill failed — fill the form in manually.')
        return
      }
      applyPrefill(data.prefill || {}, data.source)
    } catch {
      setPrefillNote('Prefill failed — fill the form in manually.')
    } finally {
      setPrefilling(false)
    }
  }

  const toggleClause = (code: string) => {
    setSelectedClauses((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  const setBlank = (code: string, token: string, value: string) => {
    setBlankValues((prev) => ({
      ...prev,
      [code]: { ...(prev[code] || {}), [token]: value },
    }))
  }

  const setBlankAt = (code: string, idx: number, value: string) => {
    setBlankArrays((prev) => {
      const arr = [...(prev[code] || [])]
      arr[idx] = value
      return { ...prev, [code]: arr }
    })
  }

  const buildDeal = () => {
    const clauseBlanks: Record<string, Record<string, string | string[]>> = {}
    for (const code of selectedClauses) {
      const entry: Record<string, string | string[]> = { ...(blankValues[code] || {}) }
      if (blankArrays[code]) entry['____'] = blankArrays[code]
      clauseBlanks[code] = entry
    }
    return {
      deal: {
        buyers: lines(buyersText),
        sellers: lines(sellersText),
        property: {
          address,
          city,
          municipality: municipality || undefined,
          legal_description: legalDescription,
          pin: pin || undefined,
          frontage: frontage || undefined,
          depth: depth || undefined,
          frontage_side: frontageSide || undefined,
          frontage_street: frontageStreet || undefined,
        },
        agreement_date: splitDate(agreementDate),
        price: Number(price),
        deposit: Number(deposit),
        deposit_due: depositDueKind === 'upon_acceptance' ? 'upon_acceptance' : depositDueText,
        deposit_holder: depositHolder,
        irrevocable: {
          by: irrevocableBy,
          time: irrevocableTime,
          date: splitDate(irrevocableDate),
        },
        completion_date: splitDate(completionDate),
        title_search_date: splitDate(titleSearchDate),
        hst,
        schedule: 'A',
        chattels: lines(chattelsText),
        exclusions: lines(exclusionsText),
        rental_items: rentals
          .filter((r) => r.desc.trim())
          .map((r) => ({ desc: r.desc.trim(), monthly: Number(r.monthly) || 0 })),
        listing_brokerage: {
          brokerage: listingBrokerage,
          agent: listingAgent || undefined,
          phone: listingPhone || undefined,
        },
        selling_brokerage: {
          brokerage: sellingBrokerage,
          agent: sellingAgent || undefined,
          phone: sellingPhone || undefined,
        },
        submitted: {
          via: submittedVia,
          time: submittedTime,
          date: splitDate(submittedDate),
        },
        inspector_name: inspectorName || undefined,
        inspection_deadline: inspectionDeadline || undefined,
      },
      forms: ['100', '801'],
      clauseCodes: selectedClauses,
      clauseBlanks,
    }
  }

  const generate = async () => {
    setGenerating(true)
    setMissing([])
    setGenError('')
    setResults([])
    try {
      const res = await fetch('/api/offers/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDeal()),
      })
      const data = await res.json()
      if (!data.ok) {
        if (Array.isArray(data.missing) && data.missing.length) setMissing(data.missing)
        else setGenError(data.error || 'Generation failed.')
        return
      }
      const urls = (data.files || []).map((f: any) => {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        return { filename: f.filename, url: URL.createObjectURL(blob) }
      })
      setResults(urls)
    } catch {
      setGenError('Generation failed — please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const renderBlankInputs = (opt: any) => {
    const blanks: string[] = opt.blanks || []
    if (!blanks.length) return null
    const code: string = opt.code
    const underscoreCount = (opt.text.match(/____/g) || []).length
    const inputs: React.ReactNode[] = []
    for (const token of blanks) {
      if (token === 'INSERT NAME') {
        inputs.push(
          <p key={token} className="text-xs text-gray-500">
            Inspector name comes from the Clause details section below.
          </p>
        )
      } else if (token === 'INSERT DATE') {
        inputs.push(
          <p key={token} className="text-xs text-gray-500">
            Date comes from the inspection deadline in Clause details below.
          </p>
        )
      } else if (token === '____') {
        for (let i = 0; i < underscoreCount; i++) {
          inputs.push(
            <input
              key={`u${i}`}
              className={inputCls}
              placeholder={`Blank ${i + 1} (see clause text)`}
              value={blankArrays[code]?.[i] || ''}
              onChange={(e) => setBlankAt(code, i, e.target.value)}
            />
          )
        }
      } else if (token === '$XXXXXX') {
        inputs.push(
          <input
            key={token}
            className={inputCls}
            placeholder="Amount, e.g. $5,000.00"
            value={blankValues[code]?.['XXXXXX'] || ''}
            onChange={(e) => setBlank(code, 'XXXXXX', e.target.value)}
          />
        )
      } else {
        inputs.push(
          <input
            key={token}
            className={inputCls}
            placeholder={token.charAt(0) + token.slice(1).toLowerCase()}
            value={blankValues[code]?.[token] || ''}
            onChange={(e) => setBlank(code, token, e.target.value)}
          />
        )
      }
    }
    return <div className="mt-2 space-y-2 pl-6">{inputs}</div>
  }

  return (
    <div className="min-h-screen bg-gray-100 p-10 flex justify-center">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-lg p-10 space-y-10">
        <div>
          <h1 className="text-2xl font-bold">Prepare an Offer</h1>
          <p className="text-gray-500 mt-1">
            Fill in what you have — anything missing, I will list for you. The PDFs come out
            editable, with your Standard Offer Clauses already in Schedule A.
          </p>
        </div>

        {/* MLS PREFILL */}
        <div className={sectionCls}>
          <h2 className={h2Cls}>Start from an MLS# or address (optional)</h2>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Start typing an address (928 Black Cherry…) or paste an MLS#"
              value={mls}
              onChange={(e) => onLookupChange(e.target.value)}
            />
            <button
              onClick={runPrefill}
              disabled={prefilling || !mls.trim()}
              className="px-5 py-2 border border-black rounded-md hover:bg-black hover:text-white transition whitespace-nowrap disabled:opacity-50"
            >
              {prefilling ? 'Looking…' : 'Pre-fill'}
            </button>
          </div>
          {prefillNote && <p className="text-sm text-gray-600">{prefillNote}</p>}
          {candidates.length > 0 && (
            <div className="space-y-2">
              {candidates.map((c) => (
                <button
                  key={c.key}
                  onClick={() => pickCandidate(c.key)}
                  disabled={prefilling}
                  className="block w-full text-left border rounded-md px-3 py-2 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  <span className="font-medium">
                    {c.address}
                    {c.city ? `, ${c.city}` : ''}
                  </span>
                  <span className="text-gray-500 text-sm">
                    {' '}
                    — ${Number(c.list_price || 0).toLocaleString()}
                    {c.beds ? ` · ${c.beds} bed` : ''}
                    {c.baths ? ` · ${c.baths} bath` : ''} · MLS# {c.key}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* PROPERTY */}
        <div className={sectionCls}>
          <h2 className={h2Cls}>Property</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Address</label>
              <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Municipality (if different)</label>
              <input className={inputCls} value={municipality} onChange={(e) => setMunicipality(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>PIN</label>
              <input className={inputCls} value={pin} onChange={(e) => setPin(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Frontage</label>
              <input className={inputCls} placeholder="40 ft" value={frontage} onChange={(e) => setFrontage(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Depth</label>
              <input className={inputCls} placeholder="100 ft" value={depth} onChange={(e) => setDepth(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Fronting on the (N/S/E/W)</label>
              <input className={inputCls} value={frontageSide} onChange={(e) => setFrontageSide(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Side of (street)</label>
              <input className={inputCls} value={frontageStreet} onChange={(e) => setFrontageStreet(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Legal description</label>
            <textarea className={inputCls} rows={2} value={legalDescription} onChange={(e) => setLegalDescription(e.target.value)} />
          </div>
        </div>

        {/* PARTIES */}
        <div className={sectionCls}>
          <h2 className={h2Cls}>Buyers &amp; Sellers</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Buyer legal names (one per line)</label>
              <textarea className={inputCls} rows={3} value={buyersText} onChange={(e) => setBuyersText(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Seller legal names (one per line)</label>
              <textarea className={inputCls} rows={3} value={sellersText} onChange={(e) => setSellersText(e.target.value)} />
            </div>
          </div>
        </div>

        {/* TERMS */}
        <div className={sectionCls}>
          <h2 className={h2Cls}>Terms</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Agreement date</label>
              <input type="date" className={inputCls} value={agreementDate} onChange={(e) => setAgreementDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Purchase price ($)</label>
              <input type="number" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Deposit ($)</label>
              <input type="number" className={inputCls} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Deposit due</label>
              <select className={inputCls} value={depositDueKind} onChange={(e) => setDepositDueKind(e.target.value)}>
                <option value="upon_acceptance">Upon Acceptance</option>
                <option value="other">Other (type it)</option>
              </select>
            </div>
            {depositDueKind === 'other' && (
              <div>
                <label className={labelCls}>Deposit due (text)</label>
                <input className={inputCls} placeholder="Within 24 hours of acceptance" value={depositDueText} onChange={(e) => setDepositDueText(e.target.value)} />
              </div>
            )}
            <div>
              <label className={labelCls}>Deposit holder</label>
              <input className={inputCls} value={depositHolder} onChange={(e) => setDepositHolder(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Irrevocable by</label>
              <select className={inputCls} value={irrevocableBy} onChange={(e) => setIrrevocableBy(e.target.value)}>
                <option value="Buyer">Buyer</option>
                <option value="Seller">Seller</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Irrevocable time</label>
              <input className={inputCls} value={irrevocableTime} onChange={(e) => setIrrevocableTime(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Irrevocable date</label>
              <input type="date" className={inputCls} value={irrevocableDate} onChange={(e) => setIrrevocableDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Completion (closing) date</label>
              <input type="date" className={inputCls} value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Title search date</label>
              <input type="date" className={inputCls} value={titleSearchDate} onChange={(e) => setTitleSearchDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>HST</label>
              <select className={inputCls} value={hst} onChange={(e) => setHst(e.target.value)}>
                <option value="in_addition">In addition to the Purchase Price</option>
                <option value="included">Included in the Purchase Price</option>
              </select>
            </div>
          </div>
        </div>

        {/* INCLUSIONS */}
        <div className={sectionCls}>
          <h2 className={h2Cls}>Chattels, Exclusions &amp; Rentals</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Chattels included (comma or one per line)</label>
              <textarea className={inputCls} rows={3} value={chattelsText} onChange={(e) => setChattelsText(e.target.value)} />
              <button
                type="button"
                onClick={insertStandardChattels}
                className="text-sm border px-3 py-1 rounded-md hover:bg-gray-100 transition mt-2"
              >
                Insert standard chattels
              </button>
            </div>
            <div>
              <label className={labelCls}>Exclusions</label>
              <textarea className={inputCls} rows={3} value={exclusionsText} onChange={(e) => setExclusionsText(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Rental items</label>
            {rentals.map((r, i) => (
              <div key={i} className="flex gap-2 mt-2">
                <input className={inputCls} placeholder="Hot water tank" value={r.desc} onChange={(e) => setRentals((prev) => prev.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} />
                <input className={inputCls} placeholder="$ / month" type="number" value={r.monthly} onChange={(e) => setRentals((prev) => prev.map((x, j) => (j === i ? { ...x, monthly: e.target.value } : x)))} />
                <button className="text-red-500 text-sm px-2" onClick={() => setRentals((prev) => prev.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <button className="text-sm border px-3 py-1 rounded-md hover:bg-gray-100 transition mt-2" onClick={() => setRentals((prev) => [...prev, { desc: '', monthly: '' }])}>
              + Add rental item
            </button>
          </div>
        </div>

        {/* BROKERAGES */}
        <div className={sectionCls}>
          <h2 className={h2Cls}>Brokerages &amp; Submission (for the 801)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Listing brokerage</label>
              <input className={inputCls} value={listingBrokerage} onChange={(e) => setListingBrokerage(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Listing agent</label>
              <input className={inputCls} value={listingAgent} onChange={(e) => setListingAgent(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Listing phone</label>
              <input className={inputCls} value={listingPhone} onChange={(e) => setListingPhone(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Selling brokerage (ours)</label>
              <input className={inputCls} value={sellingBrokerage} onChange={(e) => setSellingBrokerage(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Selling agent</label>
              <input className={inputCls} value={sellingAgent} onChange={(e) => setSellingAgent(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Selling phone</label>
              <input className={inputCls} value={sellingPhone} onChange={(e) => setSellingPhone(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Offer submitted via</label>
              <input className={inputCls} value={submittedVia} onChange={(e) => setSubmittedVia(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Submitted at (time)</label>
              <input className={inputCls} placeholder="6:45 p.m." value={submittedTime} onChange={(e) => setSubmittedTime(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Submitted date</label>
              <input type="date" className={inputCls} value={submittedDate} onChange={(e) => setSubmittedDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* CLAUSES */}
        <div className={sectionCls}>
          <h2 className={h2Cls}>Clauses</h2>
          <div>
            <p className={labelCls}>Standard Offer Clauses — in every offer</p>
            <ul className="list-disc pl-6 text-sm text-gray-600 mt-1">
              {(LIB.standards || []).map((s: any) => (
                <li key={s.id}>{s.title}</li>
              ))}
            </ul>
          </div>
          <div>
            <label className={labelCls}>Inspector name (for inspection clauses)</label>
            <input className={inputCls} value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Inspection deadline (for inspection clauses)</label>
            <input className={inputCls} placeholder="October 20, 2026" value={inspectionDeadline} onChange={(e) => setInspectionDeadline(e.target.value)} />
          </div>
          <div>
            <p className={labelCls}>Additional clauses</p>
            <div className="border rounded-md max-h-96 overflow-y-auto p-3 space-y-2 mt-1">
              {(LIB.options || []).map((opt: any) => (
                <div key={opt.code}>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedClauses.includes(opt.code)}
                      onChange={() => toggleClause(opt.code)}
                    />
                    <span>
                      <span className="font-medium">{opt.code}</span> — {opt.title}
                    </span>
                  </label>
                  {selectedClauses.includes(opt.code) && renderBlankInputs(opt)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GENERATE */}
        <div className="space-y-4">
          <button
            onClick={generate}
            disabled={generating}
            className="w-full bg-black text-white py-3 rounded-xl hover:bg-gray-800 transition disabled:opacity-50"
          >
            {generating ? 'Building…' : 'Generate Offer PDFs'}
          </button>
          {missing.length > 0 && (
            <div className="border border-red-300 bg-red-50 rounded-md p-4">
              <p className="text-sm font-medium text-red-700">Still needed:</p>
              <ul className="list-disc pl-6 text-sm text-red-700 mt-1">
                {missing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {genError && <p className="text-sm text-red-600">{genError}</p>}
          {results.length > 0 && (
            <div className="border border-green-300 bg-green-50 rounded-md p-4 space-y-2">
              <p className="text-sm font-medium text-green-800">
                Your offer is ready — both PDFs are editable. Review, adjust anything, then send for signature.
              </p>
              {results.map((r) => (
                <a
                  key={r.filename}
                  href={r.url}
                  download={r.filename}
                  className="block text-sm text-blue-700 underline"
                >
                  Download {r.filename}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Prepare an Offer — the offer workspace. Walks the intake on one page,
// pre-fills from an MLS# lookup when it can, lets the agent pick clauses
// from Tim's library (the Standard Offer Clauses always go in), and
// generates EDITABLE Form 100 + Form 801 PDFs via /api/offers/generate.

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import library from '@/lib/clauseLibrary.json'

const LIB = library as any
const BROKERAGE = 'RE/MAX Hallmark First Group Realty Ltd.'
// Team directory for the agent pickers — picking a name fills the
// phone too, where we have it.
const TEAM_AGENTS = [
  { name: 'Tim Fennessey', phone: '905 493-7355', email: 'tim@thefcgroup.ca' },
  { name: 'Aidan Comeau', phone: '', email: 'aidan@thefcgroup.ca' },
  { name: 'Beth Nickle', phone: '', email: 'beth@thefcgroup.ca' },
]
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
// Amber highlight for a required field that's still empty, so nothing
// gets missed before generating (Tim, 2026-10-21).
const miss = (v: string) =>
  !v || !String(v).trim()
    ? { borderColor: '#f59e0b', backgroundColor: '#fffbeb' }
    : undefined
const labelCls = 'text-sm font-medium'
const sectionCls = 'space-y-4'
const h2Cls = 'text-lg font-semibold'

export default function PrepareOfferPage() {
  // Package workspace state (this page IS one offer package — the tabs
  // across the top are its forms, all fed by the same answers below)
  const params = useParams()
  const packageId = String((params as any)?.id || '')
  const [tab, setTab] = useState<'offer' | '801' | 'coop' | 'library' | 'files'>('offer')
  const [pkgLoaded, setPkgLoaded] = useState(false)
  const [pkgStatus, setPkgStatus] = useState('draft')
  const [pkgDocs, setPkgDocs] = useState<any[]>([])
  const [pkgClient, setPkgClient] = useState<any>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewName, setPreviewName] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [libFiles, setLibFiles] = useState<any[]>([])
  const [libLoaded, setLibLoaded] = useState(false)
  const [coopRepresentation, setCoopRepresentation] = useState('coop')
  const [coopPayBasis, setCoopPayBasis] = useState('mls')
  const [coopPayText, setCoopPayText] = useState('')
  const [coopShare, setCoopShare] = useState('')
  const [coopBasis, setCoopBasis] = useState('of the purchase price')
  const pkgFileRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedSig = useRef('')
  const [saveState, setSaveState] = useState('')
  // MLS prefill

  // Property
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [municipalityType, setMunicipalityType] = useState('')
  const [mlsNum, setMlsNum] = useState('')
  const [legalDescription, setLegalDescription] = useState('')
  const [pin, setPin] = useState('')
  const [frontage, setFrontage] = useState('')
  const [depth, setDepth] = useState('')
  const [frontageUnit, setFrontageUnit] = useState('feet')
  const [depthUnit, setDepthUnit] = useState('feet')
  const [frontageSide, setFrontageSide] = useState('')
  const [frontageStreet, setFrontageStreet] = useState('')

  // Parties
  const [buyers, setBuyers] = useState<string[]>(['', '', '', ''])
  const [sellers, setSellers] = useState<string[]>(['', '', '', ''])
  const setBuyerAt = (i: number, v: string) =>
    setBuyers((prev) => prev.map((x, j) => (j === i ? v : x)))
  const setSellerAt = (i: number, v: string) =>
    setSellers((prev) => prev.map((x, j) => (j === i ? v : x)))

  // Terms
  const [agreementDate, setAgreementDate] = useState(todayToronto())
  const [price, setPrice] = useState('')
  const [deposit, setDeposit] = useState('')
  const [depositDueKind, setDepositDueKind] = useState('')
  const [depositDueText, setDepositDueText] = useState('')
  const [depositHolder, setDepositHolder] = useState(BROKERAGE)
  const [irrevocableBy, setIrrevocableBy] = useState('')
  const [irrevocableTime, setIrrevocableTime] = useState('11:59 p.m.')
  const [irrevocableDate, setIrrevocableDate] = useState(todayToronto())
  const [completionDate, setCompletionDate] = useState('')
  const [titleSearchDate, setTitleSearchDate] = useState('')
  const [hst, setHst] = useState('')

  // Inclusions
  const [chattelsText, setChattelsText] = useState('')
  const [exclusionsText, setExclusionsText] = useState('')
  const [rentals, setRentals] = useState<{ kind: string; desc: string; monthly: string }[]>([])

  // Brokerages + submission (Form 801)
  const [listingBrokerage, setListingBrokerage] = useState(BROKERAGE)
  const [listingAgent, setListingAgent] = useState('')
  const [listingPhone, setListingPhone] = useState('')
  const [listingEmail, setListingEmail] = useState('')
  const [sellingBrokerage, setSellingBrokerage] = useState(BROKERAGE)
  const [sellingAgent, setSellingAgent] = useState('')
  const [sellingPhone, setSellingPhone] = useState('')
  const [sellingEmail, setSellingEmail] = useState('')
  const [submittedVia, setSubmittedVia] = useState('email')
  const [submittedTime, setSubmittedTime] = useState('')
  const [submittedDate, setSubmittedDate] = useState(todayToronto())

  // Clause details
  const [inspectorName, setInspectorName] = useState('')
  const [inspectionDeadline, setInspectionDeadline] = useState('')
  // Condition deadlines — the answers the financing (B) and inspection
  // (C) standard clauses are edited to match at generation time.
  const [finDays, setFinDays] = useState('5')
  const [finTime, setFinTime] = useState('6:00 p.m.')
  const [inspDays, setInspDays] = useState('5')
  const [inspTime, setInspTime] = useState('6:00 p.m.')
  const [schedules, setSchedules] = useState('')
  const [sheetUploaded, setSheetUploaded] = useState(false)
  // Buyer's lawyer (directory-backed)
  const [lawyers, setLawyers] = useState<any[]>([])
  const [lawyerName, setLawyerName] = useState('')
  const [lawyerFirm, setLawyerFirm] = useState('')
  const [lawyerAddress, setLawyerAddress] = useState('')
  const [lawyerEmail, setLawyerEmail] = useState('')
  const [lawyerPhone, setLawyerPhone] = useState('')
  const [lawyerFax, setLawyerFax] = useState('')
  const [showAddLawyer, setShowAddLawyer] = useState(false)
  const [nlName, setNlName] = useState('')
  const [nlFirm, setNlFirm] = useState('')
  const [nlEmail, setNlEmail] = useState('')
  const [nlPhone, setNlPhone] = useState('')
  const [selectedClauses, setSelectedClauses] = useState<string[]>([])
  const [blankValues, setBlankValues] = useState<Record<string, Record<string, string>>>({})
  const [blankArrays, setBlankArrays] = useState<Record<string, string[]>>({})

  // Generation
  const [generating, setGenerating] = useState(false)
  const [missing, setMissing] = useState<string[]>([])
  const [genError, setGenError] = useState('')
  const [results, setResults] = useState<{ filename: string; url: string }[]>([])

  const [sheetBusy, setSheetBusy] = useState(false)
  const [sheetNote, setSheetNote] = useState('')
  const [schedBFillBusy, setSchedBFillBusy] = useState(false)
  const [schedBFillNote, setSchedBFillNote] = useState('')
  const [partialNote, setPartialNote] = useState('')
  const [packageNote, setPackageNote] = useState('')

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
      if (!frontageSide && f.street_side) {
        const s = String(f.street_side).trim()
        setFrontageSide(s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        filled.push('fronting side')
      }
      blank(chattelsText, f.chattels_inclusions, setChattelsText, 'inclusions')
      blank(exclusionsText, f.exclusions, setExclusionsText, 'exclusions')
      blank(listingBrokerage, f.listing_brokerage, setListingBrokerage, 'listing brokerage')
      blank(listingAgent, f.listing_agent, setListingAgent, 'listing agent')
      blank(listingPhone, f.listing_phone, setListingPhone, 'listing phone')
      blank(listingEmail, f.listing_email, setListingEmail, 'listing email')
      setSheetUploaded(true)
      setSheetNote(
        filled.length
          ? `From the sheet, filled: ${filled.join(', ')}. Everything already entered was left untouched.`
          : 'Read the sheet — everything on it was already filled in, so nothing changed.'
      )
    } catch {
      setSheetNote("Couldn't read that sheet — try again.")
    } finally {
      setSheetBusy(false)
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

  // --- package plumbing -------------------------------------------------
  const joinDate = (d: any): string => {
    if (!d || !d.year || !d.month) return ''
    const mi = MONTHS.indexOf(d.month) + 1
    if (!mi) return ''
    return `20${d.year}-${String(mi).padStart(2, '0')}-${String(d.day || '').padStart(2, '0')}`
  }

  const splitMeasure = (raw: any, setter: (v: string) => void, unitSetter: (v: string) => void) => {
    const m = String(raw).match(/^([\d.]+)\s*(.*)$/)
    if (m) {
      setter(m[1])
      if (m[2]) unitSetter(m[2])
    } else setter(String(raw))
  }

  const hydrate = (deal: any) => {
    if (!deal) return
    const p = deal.property || {}
    if (Array.isArray(deal.buyers)) setBuyers([...deal.buyers, '', '', '', ''].slice(0, 4))
    if (Array.isArray(deal.sellers)) setSellers([...deal.sellers, '', '', '', ''].slice(0, 4))
    if (p.address) setAddress(p.address)
    if (p.city) setCity(p.city)
    if (p.municipality) setMunicipality(p.municipality)
    if (p.municipality_type) setMunicipalityType(p.municipality_type)
    if (p.legal_description) setLegalDescription(p.legal_description)
    if (p.pin) setPin(String(p.pin))
    if (p.frontage) splitMeasure(p.frontage, setFrontage, setFrontageUnit)
    if (p.depth) splitMeasure(p.depth, setDepth, setDepthUnit)
    if (p.frontage_side) setFrontageSide(p.frontage_side)
    if (p.frontage_street) setFrontageStreet(p.frontage_street)
    if (p.mls) setMlsNum(p.mls)
    if (deal.agreement_date) setAgreementDate(joinDate(deal.agreement_date))
    if (deal.price) setPrice(String(deal.price))
    if (deal.deposit) setDeposit(String(deal.deposit))
    if (deal.deposit_due) {
      if (deal.deposit_due === 'upon_acceptance') setDepositDueKind('upon_acceptance')
      else {
        setDepositDueKind('specific')
        setDepositDueText(String(deal.deposit_due))
      }
    }
    if (deal.deposit_holder) setDepositHolder(deal.deposit_holder)
    if (deal.irrevocable) {
      if (deal.irrevocable.by) setIrrevocableBy(deal.irrevocable.by)
      if (deal.irrevocable.time) setIrrevocableTime(deal.irrevocable.time)
      if (deal.irrevocable.date) setIrrevocableDate(joinDate(deal.irrevocable.date))
    }
    if (deal.completion_date) setCompletionDate(joinDate(deal.completion_date))
    if (deal.title_search_date) setTitleSearchDate(joinDate(deal.title_search_date))
    if (deal.hst) setHst(deal.hst)
    if (Array.isArray(deal.chattels)) setChattelsText(deal.chattels.join('\n'))
    if (Array.isArray(deal.exclusions)) setExclusionsText(deal.exclusions.join('\n'))
    if (Array.isArray(deal.rental_items))
      setRentals(
        deal.rental_items.map((r: any) => ({
          kind: r.desc === 'Hot water tank' ? 'hot_water_tank' : r.desc ? 'other' : '',
          desc: r.desc || '',
          monthly: String(r.monthly ?? ''),
        }))
      )
    const lb = deal.listing_brokerage || {}
    if (lb.brokerage) setListingBrokerage(lb.brokerage)
    if (lb.agent) setListingAgent(lb.agent)
    if (lb.phone) setListingPhone(lb.phone)
    if (lb.email) setListingEmail(lb.email)
    const sb = deal.selling_brokerage || {}
    if (sb.brokerage) setSellingBrokerage(sb.brokerage)
    if (sb.agent) setSellingAgent(sb.agent)
    if (sb.phone) setSellingPhone(sb.phone)
    if (sb.email) setSellingEmail(sb.email)
    const sub = deal.submitted || {}
    if (sub.via) setSubmittedVia(sub.via)
    if (sub.time) setSubmittedTime(sub.time)
    if (sub.date) setSubmittedDate(joinDate(sub.date))
    if (deal.inspector_name) setInspectorName(deal.inspector_name)
    if (deal.inspection_deadline) setInspectionDeadline(deal.inspection_deadline)
    const ct = deal.condition_terms || {}
    if (ct.financing) {
      if (ct.financing.days) setFinDays(String(ct.financing.days))
      if (ct.financing.time) setFinTime(ct.financing.time)
    }
    if (ct.inspection) {
      if (ct.inspection.days) setInspDays(String(ct.inspection.days))
      if (ct.inspection.time) setInspTime(ct.inspection.time)
    }
    if (deal.schedule) setSchedules(deal.schedule)
    if (deal.listing_sheet) setSheetUploaded(true)
    const bl = deal.buyer_lawyer || {}
    if (bl.name) setLawyerName(bl.name)
    if (bl.firm) setLawyerFirm(bl.firm)
    if (bl.address) setLawyerAddress(bl.address)
    if (bl.email) setLawyerEmail(bl.email)
    if (bl.phone) setLawyerPhone(bl.phone)
    if (bl.fax) setLawyerFax(bl.fax)
    if (deal.coop) {
      if (deal.coop.total) setCoopTotal(deal.coop.total)
      if (deal.coop.share) setCoopShare(deal.coop.share)
      if (deal.coop.basis) setCoopBasis(deal.coop.basis)
      if (deal.coop.representation) setCoopRepresentation(deal.coop.representation)
      if (deal.coop.pay_basis) setCoopPayBasis(deal.coop.pay_basis)
      if (deal.coop.pay_text) setCoopPayText(deal.coop.pay_text)
    }
    if (Array.isArray(deal.clause_codes)) setSelectedClauses(deal.clause_codes)
    if (deal.clause_blanks) {
      const bv: Record<string, Record<string, string>> = {}
      const ba: Record<string, string[]> = {}
      for (const [code, entry] of Object.entries<any>(deal.clause_blanks)) {
        const { ____, ...rest } = entry || {}
        bv[code] = rest as Record<string, string>
        if (Array.isArray(____)) ba[code] = ____ as string[]
      }
      setBlankValues(bv)
      setBlankArrays(ba)
    }
    if (deal.client) setPkgClient(deal.client)
  }

  const pkgAct = async (body: any) => {
    const res = await fetch('/api/offers/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || 'Action failed')
    return data
  }

  const refreshPkg = async () => {
    try {
      const res = await fetch(`/api/offers/packages?id=${packageId}`)
      const data = await res.json()
      if (data.ok && data.package) {
        setPkgDocs(Array.isArray(data.package.documents) ? data.package.documents : [])
        setPkgStatus(data.package.status || 'draft')
      }
    } catch {
      /* leave as-is */
    }
  }

  useEffect(() => {
    if (!packageId) return
    ;(async () => {
      try {
        const res = await fetch(`/api/offers/packages?id=${packageId}`)
        const data = await res.json()
        if (data.ok && data.package) {
          setPkgStatus(data.package.status || 'draft')
          setPkgDocs(Array.isArray(data.package.documents) ? data.package.documents : [])
          hydrate(data.package.deal)
        }
      } catch {
        /* a fresh package simply starts blank */
      }
      setPkgLoaded(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId])

  // Lawyer directory (shared across packages) — pick a lawyer the
  // team's clients have used before, or add a new one and it's kept.
  useEffect(() => {
    fetch('/api/offers/packages?lawyers=1')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setLawyers(d.lawyers || [])
      })
      .catch(() => {})
  }, [])

  const pickLawyer = (idx: string) => {
    const lw = lawyers[Number(idx)]
    if (!lw) return
    setLawyerName(lw.name || '')
    setLawyerFirm(lw.firm || '')
    setLawyerAddress(lw.address || '')
    setLawyerEmail(lw.email || '')
    setLawyerPhone(lw.phone || '')
    setLawyerFax(lw.fax || '')
  }

  const addLawyer = async () => {
    if (!nlName.trim()) return
    try {
      const data = await pkgAct({
        action: 'add_lawyer',
        lawyer: { name: nlName, firm: nlFirm, email: nlEmail, phone: nlPhone },
      })
      setLawyers(data.lawyers || [])
      setLawyerName(nlName.trim())
      setLawyerFirm(nlFirm.trim())
      setLawyerEmail(nlEmail.trim())
      setLawyerPhone(nlPhone.trim())
      setLawyerAddress('')
      setLawyerFax('')
      setShowAddLawyer(false)
      setNlName('')
      setNlFirm('')
      setNlEmail('')
      setNlPhone('')
    } catch {
      /* the directory is a convenience — the typed details still save with this package */
    }
  }

  const onSchedBUpload = async (file: File | null) => {
    if (!file || !packageId) return
    try {
      const fd = new FormData()
      fd.append('id', packageId)
      fd.append('doc_form', 'schedule_b')
      fd.append('file', file)
      const res = await fetch('/api/offers/packages', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.ok) {
        setActionNote('Schedule B added to this package.')
        if (!schedules.trim()) setSchedules('B')
        refreshPkg()
      } else {
        setGenError(data.error || "Couldn't add the Schedule B.")
      }
    } catch {
      setGenError("Couldn't add the Schedule B — check the connection and try again.")
    }
  }

  const onFillSchedB = async () => {
    if (!packageId) return
    setSchedBFillBusy(true)
    setSchedBFillNote('')
    try {
      // Make sure the latest names/address are saved before filling.
      await pkgAct({ action: 'update_deal', id: packageId, deal: buildDeal().deal })
      const res = await fetch('/api/offers/schedule-b-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packageId }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Fill failed')
      await refreshDocs()
      const placed = (data.placed || [])
        .map((k: string) =>
          k === 'buyers'
            ? 'buyer names'
            : k === 'sellers'
              ? 'seller names'
              : k === 'date'
                ? 'the agreement date'
                : 'the property'
        )
        .join(', ')
      const missed =
        Array.isArray(data.missing) && data.missing.length
          ? ` Couldn't place: ${data.missing.join(', ')} — check the filled copy.`
          : ''
      setSchedBFillNote(`Added "Schedule B (names filled).pdf" to the package — filled ${placed}.${missed}`)
    } catch (e: any) {
      setSchedBFillNote(e.message)
    } finally {
      setSchedBFillBusy(false)
    }
  }

  const loadLibrary = async () => {
    if (libLoaded) return
    try {
      const res = await fetch('/api/offers/packages?library=1')
      const data = await res.json()
      if (data.ok) setLibFiles(data.files || [])
    } catch {
      /* library unavailable */
    }
    setLibLoaded(true)
  }

  const attachLibrary = async (f: any) => {
    setActionNote('')
    try {
      const data = await pkgAct({ action: 'attach_library', id: packageId, path: f.path, name: f.name })
      setPkgDocs(data.documents || [])
      setActionNote(`Added ${f.name} to this package — see Package Files.`)
    } catch (e: any) {
      setActionNote(e.message)
    }
  }

  const onPkgAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const fd = new FormData()
      fd.append('id', packageId)
      fd.append('file', file)
      const res = await fetch('/api/offers/packages', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Upload failed')
      setPkgDocs(data.documents || [])
      setActionNote(`Added ${file.name} to this package.`)
    } catch (err: any) {
      setActionNote(err.message)
    }
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
        buyers: buyers.map((s) => s.trim()).filter(Boolean),
        sellers: sellers.map((s) => s.trim()).filter(Boolean),
        property: {
          address,
          city,
          municipality: municipality || undefined,
          municipality_type: municipalityType || undefined,
          legal_description: legalDescription,
          pin: pin || undefined,
          frontage: frontage ? `${frontage} ${frontageUnit}` : undefined,
          depth: depth ? `${depth} ${depthUnit}` : undefined,
          frontage_side: frontageSide || undefined,
          frontage_street: frontageStreet || undefined,
          mls: mlsNum || undefined,
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
        schedule: schedules || undefined,
        chattels: lines(chattelsText),
        exclusions: lines(exclusionsText),
        rental_items: rentals.map((r) => ({
          desc: r.kind === 'hot_water_tank' ? 'Hot water tank' : r.desc.trim(),
          monthly: r.monthly,
        })).filter((r) => r.desc),
          .filter((r) => r.desc.trim())
          .map((r) => ({ desc: r.desc.trim(), monthly: Number(r.monthly) || 0 })),
        listing_brokerage: {
          brokerage: listingBrokerage,
          agent: listingAgent || undefined,
          phone: listingPhone || undefined,
          email: listingEmail || undefined,
        },
        selling_brokerage: {
          brokerage: sellingBrokerage,
          agent: sellingAgent || undefined,
          phone: sellingPhone || undefined,
          email: sellingEmail || undefined,
        },
        submitted: {
          via: submittedVia,
          time: submittedTime,
          date: splitDate(submittedDate),
        },
        coop: {
          share: coopShare,
          basis: coopBasis,
          representation: coopRepresentation,
          pay_basis: coopPayBasis,
          pay_text: coopPayText || undefined,
        },
        client: pkgClient || undefined,
        inspector_name: inspectorName || undefined,
        inspection_deadline: inspectionDeadline || undefined,
        condition_terms: {
          financing: { days: finDays, time: finTime },
          inspection: { days: inspDays, time: inspTime },
        },
        listing_sheet: sheetUploaded || undefined,
        buyer_lawyer: lawyerName
          ? {
              name: lawyerName,
              firm: lawyerFirm || undefined,
              address: [lawyerFirm, lawyerAddress].filter(Boolean).join(', ') || undefined,
              email: lawyerEmail || undefined,
              phone: lawyerPhone || undefined,
              fax: lawyerFax || undefined,
            }
          : undefined,
      },
      forms: ['100', '801'],
      clauseCodes: selectedClauses,
      clauseBlanks,
    }
  }

  const formForTab = (): string | null =>
    tab === 'offer' ? '100' : tab === '801' ? '801' : tab === 'coop' ? '320' : null

  const formLabel = (): string =>
    tab === 'offer'
      ? 'Form 100 — the Offer'
      : tab === '801'
        ? 'Form 801'
        : 'Form 320 — Confirmation of Co-operation'

  const surfaceFile = (data: any) => {
    const f = (data.files || [])[0]
    if (!f) return
    const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    setPreviewName(f.filename)
    setResults([{ filename: f.filename, url }])
  }

  const runGenerate = async (opts: {
    allowPartial?: boolean
    save?: boolean
  }): Promise<any | null> => {
    const form = formForTab()
    if (!form) return null
    setGenerating(true)
    setMissing([])
    setGenError('')
    setActionNote('')
    setPartialNote('')
    if (!opts.save) {
      setResults([])
      setPreviewUrl('')
    }
    try {
      const payload: any = {
        ...buildDeal(),
        forms: [form],
        allow_partial: !!opts.allowPartial,
      }
      if (opts.save) payload.package_id = packageId
      else payload.save_package = false
      const res = await fetch('/api/offers/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.ok) {
        if (Array.isArray(data.missing) && data.missing.length) setMissing(data.missing)
        else setGenError(data.error || 'Generation failed.')
        return null
      }
      if (data.partial) {
        setPartialNote(
          `Generated with what you have — still missing: ${(data.missing || []).join('; ')}`
        )
      }
      if (opts.save) {
        await refreshPkg()
        setActionNote(
          data.package_error
            ? `The PDF is ready below, but saving to the package failed: ${data.package_error}`
            : 'Saved to this package — find it under Package Files.'
        )
      }
      return data
    } catch {
      setGenError('Generation failed — please try again.')
      return null
    } finally {
      setGenerating(false)
    }
  }

  const previewForm = async () => {
    const data = await runGenerate({})
    if (data) surfaceFile(data)
  }

  const saveForm = async (allowPartial = false) => {
    const data = await runGenerate({ save: true, allowPartial })
    if (data) surfaceFile(data)
  }

  const previewAnyway = async () => {
    const data = await runGenerate({ allowPartial: true })
    if (data) surfaceFile(data)
  }

  // Autosave — the answers are the package. Any change writes back to
  // the package after a short pause, so leaving mid-offer (or losing
  // the connection) loses nothing. The first signature seen after the
  // package loads is the hydrated state itself and is absorbed, not
  // saved.
  const dealSignature = (() => {
    try {
      const b = buildDeal()
      return JSON.stringify({
        ...b.deal,
        clause_codes: b.clauseCodes,
        clause_blanks: b.clauseBlanks,
      })
    } catch {
      return ''
    }
  })()

  useEffect(() => {
    if (!pkgLoaded || !packageId || !dealSignature) return
    if (!lastSavedSig.current) {
      lastSavedSig.current = dealSignature
      return
    }
    if (dealSignature === lastSavedSig.current) return
    setSaveState('Saving…')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const b = buildDeal()
        await pkgAct({
          action: 'update_deal',
          id: packageId,
          deal: {
            ...b.deal,
            clause_codes: b.clauseCodes,
            clause_blanks: b.clauseBlanks,
          },
        })
        lastSavedSig.current = dealSignature
        setSaveState(
          `Autosaved ${new Date().toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`
        )
      } catch {
        setSaveState(
          "Autosave couldn't reach the server — your work is still on this screen, and Save to package will store it."
        )
      }
    }, 1500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealSignature, pkgLoaded, packageId])

  // Live preview of a standard condition clause with the deadline
  // answers applied — the same edit the generator makes.
  const ORDINAL_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
  const clausePreview = (code: string, days: string, time: string): string => {
    const std = (LIB.standards || []).find((s: any) => s.code === code)
    if (!std) return ''
    let t = String(std.text || '')
    const d = parseInt(days, 10)
    if (d >= 1 && d <= 10 && d !== 5) {
      t = t.split('fifth banking day').join(`${ORDINAL_WORDS[d]} banking day`)
    }
    if (time && time !== '6:00 p.m.') t = t.split('6:00 p.m.').join(time)
    return t
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
            This clause asks for a name — it's filled in on the generated PDF.
          </p>
        )
      } else if (token === 'INSERT DATE') {
        inputs.push(
          <p key={token} className="text-xs text-gray-500">
            This clause asks for a date — it's filled in on the generated PDF.
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">
              {address || 'Offer package'}
              {city ? <span className="text-gray-500 font-normal">, {city}</span> : null}
            </h1>
            <select
              className="border rounded-md px-2 py-1.5 text-sm ml-auto"
              value={pkgStatus}
              onChange={async (e) => {
                const v = e.target.value
                setPkgStatus(v)
                try {
                  await pkgAct({ action: 'set_status', id: packageId, status: v })
                } catch {
                  /* status stays local until the next save */
                }
              }}
            >
              <option value="draft">Draft</option>
              <option value="ready">Ready for Signature</option>
              <option value="out">Out for Signature</option>
              <option value="signed">Signed</option>
              <option value="dead">Dead</option>
            </select>
            <a href="/dashboard/offers" className="text-sm text-blue-700 underline">
              All offers
            </a>
          </div>
          <p className="text-gray-500 mt-1">
            One package, one set of answers — every form below is filled from the same facts.
            Preview a form before you download it or send it for signature.
          </p>
          {pkgClient?.name && (
            <p className="text-sm text-gray-600 mt-1">
              Client: <span className="font-medium">{pkgClient.name}</span>
              {pkgClient.client_file_id
                ? ' — linked to their client file'
                : ''}
            </p>
          )}
          {!pkgLoaded && <p className="text-sm text-gray-400 mt-1">Loading this package…</p>}
          {saveState && <p className="text-xs text-gray-400 mt-1">{saveState}</p>}
          {pkgLoaded && (
            <p className="text-xs text-amber-600 mt-1">
              Fields highlighted amber still need completing.
            </p>
          )}
        </div>

        {/* FORM TABS */}
        <div className="flex flex-wrap gap-2 border-b pb-4">
          {(
            [
              ['offer', 'Offer — Form 100'],
              ['801', 'Form 801'],
              ['coop', 'Confirmation — 320'],
              ['library', 'Add from Library'],
              ['files', `Package Files${pkgDocs.length ? ` (${pkgDocs.length})` : ''}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key as any)
                // A preview belongs to its form — switching tabs clears it,
                // so a Form 100 preview never lingers on the 801 tab.
                setResults([])
                setPreviewUrl('')
                setMissing([])
                setGenError('')
                setActionNote('')
                setPartialNote('')
                if (key === 'library') loadLibrary()
              }}
              className={`px-4 py-2 rounded-full text-sm border transition ${
                tab === key ? 'bg-black text-white' : 'hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* LISTING DOCUMENTS */}
        <div className={tab === 'offer' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>MLS Listing &amp; Schedule B</h2>
          <div>
            <p className="text-sm text-gray-600">
              Upload the MLS listing (the REALM printout — PDF or photo) and I'll fill what's
              still blank from it — seller names and the listing agent's email included, if
              they're on it.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <label className="text-sm border px-3 py-2 rounded-md hover:bg-gray-100 transition cursor-pointer whitespace-nowrap">
                {sheetBusy
                  ? 'Reading…'
                  : sheetUploaded
                    ? 'MLS listing on file — replace it'
                    : 'Upload MLS listing'}
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
          <div className="border-t pt-4 mt-2">
            <p className="text-sm text-gray-600">
              Schedule B comes with the listing — download it from REALM and add it here, and it
              goes into this package. (The listing data feed carries details, not documents, so
              this one can't be pulled automatically.)
            </p>
            <div className="flex items-center gap-3 mt-2">
              <label className="text-sm border px-3 py-2 rounded-md hover:bg-gray-100 transition cursor-pointer whitespace-nowrap">
                {pkgDocs.some((d: any) => d.form === 'schedule_b')
                  ? 'Schedule B in package — replace it'
                  : 'Add Schedule B (PDF)'}
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    onSchedBUpload(e.target.files?.[0] || null)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            {pkgDocs.some((d: any) => d.form === 'schedule_b') && (
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={onFillSchedB}
                  disabled={schedBFillBusy}
                  className="text-sm border px-3 py-2 rounded-md hover:bg-gray-100 transition disabled:opacity-50 whitespace-nowrap"
                >
                  {schedBFillBusy ? 'Filling…' : 'Fill names & address onto the Schedule B'}
                </button>
                {schedBFillNote && <span className="text-sm text-gray-600">{schedBFillNote}</span>}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">
              The fill adds the buyers, sellers and property from this package onto a copy of
              the flattened Schedule B (still editable) — the original stays untouched.
            </p>
          </div>
        </div>

        {/* PROPERTY */}
        <div className={tab === 'offer' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>Property</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Address</label>
              <input className={inputCls} style={miss(address)} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>In the… (City of / Town of…)</label>
              <select className={inputCls} value={municipalityType} onChange={(e) => setMunicipalityType(e.target.value)}>
                <option value=""></option>
                <option value="City of">City of</option>
                <option value="Town of">Town of</option>
                <option value="Township of">Township of</option>
                <option value="Municipality of">Municipality of</option>
                <option value="Village of">Village of</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>City</label>
              <input className={inputCls} style={miss(city)} value={city} onChange={(e) => setCity(e.target.value)} />
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
              <div className="flex gap-2">
                <input className={inputCls} placeholder="40.06" value={frontage} onChange={(e) => setFrontage(e.target.value)} />
                <select className="border p-3 rounded-md" value={frontageUnit} onChange={(e) => setFrontageUnit(e.target.value)}>
                  <option value="feet">feet</option>
                  <option value="metres">metres</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Depth</label>
              <div className="flex gap-2">
                <input className={inputCls} placeholder="100.1" value={depth} onChange={(e) => setDepth(e.target.value)} />
                <select className="border p-3 rounded-md" value={depthUnit} onChange={(e) => setDepthUnit(e.target.value)}>
                  <option value="feet">feet</option>
                  <option value="metres">metres</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Fronting on the *</label>
              <select className={inputCls} style={miss(frontageSide)} value={frontageSide} onChange={(e) => setFrontageSide(e.target.value)}>
                <option value=""></option>
                <option value="North">North</option>
                <option value="South">South</option>
                <option value="East">East</option>
                <option value="West">West</option>
                <option value="Northeast">Northeast</option>
                <option value="Northwest">Northwest</option>
                <option value="Southeast">Southeast</option>
                <option value="Southwest">Southwest</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Side of (street)</label>
              <input className={inputCls} value={frontageStreet} onChange={(e) => setFrontageStreet(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Legal description</label>
            <textarea className={inputCls} style={miss(legalDescription)} rows={2} value={legalDescription} onChange={(e) => setLegalDescription(e.target.value)} />
          </div>
        </div>

        {/* PARTIES */}
        <div className={tab === 'offer' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>Buyers &amp; Sellers</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={labelCls}>Buyer legal names</label>
              {buyers.map((b, i) => (
                <input
                  key={i}
                  className={inputCls}
                  style={i === 0 ? miss(buyers.join('')) : undefined}
                  placeholder={`Buyer ${i + 1}`}
                  value={b}
                  onChange={(e) => setBuyerAt(i, e.target.value)}
                />
              ))}
            </div>
            <div className="space-y-2">
              <label className={labelCls}>Seller legal names</label>
              {sellers.map((s, i) => (
                <input
                  key={i}
                  className={inputCls}
                  style={i === 0 ? miss(sellers.join('')) : undefined}
                  placeholder={`Seller ${i + 1}`}
                  value={s}
                  onChange={(e) => setSellerAt(i, e.target.value)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* TERMS */}
        <div className={tab === 'offer' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>Terms</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Agreement date</label>
              <input type="date" className={inputCls} style={miss(agreementDate)} value={agreementDate} onChange={(e) => setAgreementDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Purchase price ($)</label>
              <input type="number" className={inputCls} style={miss(price)} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Deposit ($)</label>
              <input type="number" className={inputCls} style={miss(deposit)} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Deposit due *</label>
              <select className={inputCls} style={miss(depositDueKind)} value={depositDueKind} onChange={(e) => setDepositDueKind(e.target.value)}>
                <option value=""></option>
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
              <label className={labelCls}>Irrevocable by *</label>
              <select className={inputCls} style={miss(irrevocableBy)} value={irrevocableBy} onChange={(e) => setIrrevocableBy(e.target.value)}>
                <option value=""></option>
                <option value="Buyer">Buyer</option>
                <option value="Seller">Seller</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Irrevocable time</label>
              <input className={inputCls} style={miss(irrevocableTime)} value={irrevocableTime} onChange={(e) => setIrrevocableTime(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Irrevocable date</label>
              <input type="date" className={inputCls} style={miss(irrevocableDate)} value={irrevocableDate} onChange={(e) => setIrrevocableDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Completion (closing) date</label>
              <input type="date" className={inputCls} style={miss(completionDate)} value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Title search date</label>
              <input type="date" className={inputCls} style={miss(titleSearchDate)} value={titleSearchDate} onChange={(e) => setTitleSearchDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>HST *</label>
              <select className={inputCls} style={miss(hst)} value={hst} onChange={(e) => setHst(e.target.value)}>
                <option value=""></option>
                <option value="in_addition">In addition to the Purchase Price</option>
                <option value="included">Included in the Purchase Price</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Schedules attached</label>
              <input className={inputCls} placeholder="B" value={schedules} onChange={(e) => setSchedules(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">
                Only the extra schedules — your clauses (Schedule A) are already part of the
                Form 100. Type B when the listing's Schedule B is attached; leave blank if none.
              </p>
            </div>
          </div>
        </div>

        {/* NOTICE DELIVERY */}
        <div className={tab === 'offer' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>Notice Delivery</h2>
          <p className="text-sm text-gray-500">
            The email addresses notices under this agreement are delivered to — they print on
            the Form 100. The buyer's agent is whoever is preparing this offer; the seller's
            agent's email usually comes off the REALM listing sheet.
          </p>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label className={labelCls}>Buyer's agent email (ours)</label>
              <input className={inputCls} placeholder="tim@thefcgroup.ca" value={sellingEmail} onChange={(e) => setSellingEmail(e.target.value)} />
              <select
                className="w-full border p-2 rounded-md mt-2 text-sm text-gray-600"
                value={TEAM_AGENTS.some((t) => t.email === sellingEmail) ? sellingEmail : ''}
                onChange={(e) => {
                  const t = TEAM_AGENTS.find((x) => x.email === e.target.value)
                  if (t) {
                    setSellingEmail(t.email)
                    setSellingAgent(t.name)
                    if (t.phone) setSellingPhone(t.phone)
                  }
                }}
              >
                <option value="">…or pick who's preparing it</option>
                {TEAM_AGENTS.map((t) => (
                  <option key={t.email} value={t.email}>
                    {t.name} — {t.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Seller's agent email (listing)</label>
              <input className={inputCls} placeholder="From the listing sheet" value={listingEmail} onChange={(e) => setListingEmail(e.target.value)} />
            </div>
          </div>
        </div>

        {/* BUYER'S LAWYER */}
        <div className={tab === 'offer' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>Buyer's Lawyer</h2>
          <div>
            <label className={labelCls}>Pick a lawyer our clients have used</label>
            <select
              className={inputCls}
              value={(() => {
                const i = lawyers.findIndex(
                  (lw) => lw.name === lawyerName && (lw.firm || '') === lawyerFirm
                )
                return i >= 0 ? String(i) : ''
              })()}
              onChange={(e) => pickLawyer(e.target.value)}
            >
              <option value="">— pick a lawyer —</option>
              {lawyers.map((lw, i) => (
                <option key={i} value={i}>
                  {lw.name}
                  {lw.firm ? ` — ${lw.firm}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label className={labelCls}>Lawyer name</label>
              <input className={inputCls} value={lawyerName} onChange={(e) => setLawyerName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Firm</label>
              <input className={inputCls} value={lawyerFirm} onChange={(e) => setLawyerFirm(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input className={inputCls} value={lawyerAddress} onChange={(e) => setLawyerAddress(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input className={inputCls} value={lawyerEmail} onChange={(e) => setLawyerEmail(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} value={lawyerPhone} onChange={(e) => setLawyerPhone(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Fax</label>
              <input className={inputCls} value={lawyerFax} onChange={(e) => setLawyerFax(e.target.value)} />
            </div>
          </div>
          {!showAddLawyer ? (
            <button
              type="button"
              className="text-sm text-blue-700 underline mt-3"
              onClick={() => setShowAddLawyer(true)}
            >
              + Add a new lawyer to the list
            </button>
          ) : (
            <div className="border rounded-md p-3 mt-3 space-y-2">
              <p className="text-sm font-medium">New lawyer — saved to the list for next time</p>
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Name" value={nlName} onChange={(e) => setNlName(e.target.value)} />
                <input className={inputCls} placeholder="Firm" value={nlFirm} onChange={(e) => setNlFirm(e.target.value)} />
                <input className={inputCls} placeholder="Email" value={nlEmail} onChange={(e) => setNlEmail(e.target.value)} />
                <input className={inputCls} placeholder="Phone" value={nlPhone} onChange={(e) => setNlPhone(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button type="button" className="text-sm border px-3 py-2 rounded-md hover:bg-gray-100" onClick={addLawyer}>
                  Save to the list
                </button>
                <button type="button" className="text-sm px-3 py-2 text-gray-500" onClick={() => setShowAddLawyer(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* INCLUSIONS */}
        <div className={tab === 'offer' ? sectionCls : 'hidden'}>
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
                <select
                  className={inputCls}
                  value={r.kind}
                  onChange={(e) =>
                    setRentals((prev) =>
                      prev.map((x, j) =>
                        j === i
                          ? { ...x, kind: e.target.value, desc: e.target.value === 'other' ? x.desc : '' }
                          : x
                      )
                    )
                  }
                >
                  <option value=""></option>
                  <option value="hot_water_tank">Hot water tank</option>
                  <option value="other">Other</option>
                </select>
                {r.kind === 'other' && (
                  <input className={inputCls} placeholder="What's rented?" value={r.desc} onChange={(e) => setRentals((prev) => prev.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} />
                )}
                <input className={inputCls} placeholder="$ / month" type="number" value={r.monthly} onChange={(e) => setRentals((prev) => prev.map((x, j) => (j === i ? { ...x, monthly: e.target.value } : x)))} />
                <button className="text-red-500 text-sm px-2" onClick={() => setRentals((prev) => prev.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <button className="text-sm border px-3 py-1 rounded-md hover:bg-gray-100 transition mt-2" onClick={() => setRentals((prev) => [...prev, { kind: '', desc: '', monthly: '' }])}>
              + Add rental item
            </button>
          </div>
        </div>

        {/* BROKERAGES */}
        <div className={tab === '801' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>Brokerages &amp; Submission (for the 801)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Listing brokerage</label>
              <input className={inputCls} value={listingBrokerage} onChange={(e) => setListingBrokerage(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Listing agent</label>
              <input className={inputCls} style={miss(listingAgent)} value={listingAgent} onChange={(e) => setListingAgent(e.target.value)} />
              <select
                className="w-full border p-2 rounded-md mt-2 text-sm text-gray-600"
                value={TEAM_AGENTS.some((t) => t.name === listingAgent) ? listingAgent : ''}
                onChange={(e) => {
                  const t = TEAM_AGENTS.find((x) => x.name === e.target.value)
                  if (t) {
                    setListingAgent(t.name)
                    if (t.phone) setListingPhone(t.phone)
                    if (t.email) setListingEmail(t.email)
                  }
                }}
              >
                <option value="">…or pick a team agent</option>
                {TEAM_AGENTS.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
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
              <input className={inputCls} style={miss(sellingAgent)} value={sellingAgent} onChange={(e) => setSellingAgent(e.target.value)} />
              <select
                className="w-full border p-2 rounded-md mt-2 text-sm text-gray-600"
                value={TEAM_AGENTS.some((t) => t.name === sellingAgent) ? sellingAgent : ''}
                onChange={(e) => {
                  const t = TEAM_AGENTS.find((x) => x.name === e.target.value)
                  if (t) {
                    setSellingAgent(t.name)
                    if (t.phone) setSellingPhone(t.phone)
                    if (t.email) setSellingEmail(t.email)
                  }
                }}
              >
                <option value="">…or pick a team agent</option>
                {TEAM_AGENTS.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Selling phone</label>
              <input className={inputCls} value={sellingPhone} onChange={(e) => setSellingPhone(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Offer submitted via</label>
              <input className={inputCls} style={miss(submittedVia)} value={submittedVia} onChange={(e) => setSubmittedVia(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Submitted at (time)</label>
              <input className={inputCls} style={miss(submittedTime)} placeholder="6:45 p.m." value={submittedTime} onChange={(e) => setSubmittedTime(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Submitted date</label>
              <input type="date" className={inputCls} style={miss(submittedDate)} value={submittedDate} onChange={(e) => setSubmittedDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* CLAUSES */}
        <div className={tab === 'offer' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>Clauses</h2>
          <div>
            <p className={labelCls}>Standard Offer Clauses — in every offer</p>
            <ul className="list-disc pl-6 text-sm text-gray-600 mt-1">
              {(LIB.standards || []).map((s: any) => (
                <li key={s.id}>{s.title}</li>
              ))}
            </ul>
          </div>
          <div className="border rounded-md p-3 space-y-4">
            <div>
              <p className={labelCls}>Financing condition — Clause B deadline</p>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                <span>Conditional until</span>
                <input className="border p-2 rounded-md w-24" value={finTime} onChange={(e) => setFinTime(e.target.value)} />
                <span>on the</span>
                <input type="number" min={1} max={10} className="border p-2 rounded-md w-16" value={finDays} onChange={(e) => setFinDays(e.target.value)} />
                <span>banking day after the date of acceptance</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">{clausePreview('B', finDays, finTime)}</p>
            </div>
            <div>
              <p className={labelCls}>Home inspection condition — Clause C deadline</p>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                <span>Inspection by a registered home inspector, at the buyer's expense, by</span>
                <input className="border p-2 rounded-md w-24" value={inspTime} onChange={(e) => setInspTime(e.target.value)} />
                <span>on the</span>
                <input type="number" min={1} max={10} className="border p-2 rounded-md w-16" value={inspDays} onChange={(e) => setInspDays(e.target.value)} />
                <span>banking day after the date of acceptance</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">{clausePreview('C', inspDays, inspTime)}</p>
            </div>
            <p className="text-xs text-gray-400">
              The wording above is the actual clause — Schedule A is edited to match these
              answers. Standard wording: 6:00 p.m. on the fifth banking day.
            </p>
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

        {/* COOP — FORM 320 */}
        <div className={tab === 'coop' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>Confirmation of Co-operation — Form 320</h2>
          <p className="text-sm text-gray-600">
            Two things decide what gets ticked on the 320: how the buyer is represented, and —
            when we're the co-operating brokerage — what's payable to us. The brokerages
            themselves come from your answers on the Form 801 tab.
          </p>
          <div>
            <label className={labelCls}>Type of representation *</label>
            <select className={inputCls} value={coopRepresentation} onChange={(e) => setCoopRepresentation(e.target.value)}>
              <option value="coop">Co-operating brokerage — we represent the buyer (designated representation, our usual)</option>
              <option value="same_brokerage_diff_reps">Same brokerage as the listing — different designated representatives (no multiple representation)</option>
              <option value="multiple_brokerage">Multiple representation — our brokerage represents both sides, with a Representation Agreement with the buyer</option>
              <option value="multiple_same_rep">Multiple representation — the same designated representative acts for both seller and buyer</option>
              <option value="sold_by_us_direct">Our own listing, sold to our buyer — the buyer pays us directly</option>
              <option value="sold_by_us_agreement">Our own listing, sold to our buyer — paid under the commission agreement</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Anything other than co-operating means the listing side is ours too — both
              brokerage blocks on page 2 of the form get filled in.
            </p>
          </div>
          {coopRepresentation === 'coop' && (
            <>
              <div>
                <label className={labelCls}>Co-operating commission is</label>
                <select className={inputCls} value={coopPayBasis} onChange={(e) => setCoopPayBasis(e.target.value)}>
                  <option value="mls">As indicated in the MLS information (amount below)</option>
                  <option value="follows">Paid as follows (describe it)</option>
                </select>
              </div>
              {coopPayBasis === 'mls' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Payable to co-operating brokerage (%) *</label>
                    <input className={inputCls} style={miss(coopShare)} placeholder="2.5" value={coopShare} onChange={(e) => setCoopShare(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Of</label>
                    <input className={inputCls} value={coopBasis} onChange={(e) => setCoopBasis(e.target.value)} />
                  </div>
                  <p className="text-xs text-gray-400 col-span-2">
                    Prints on the form as “{coopShare || '…'}% {coopBasis}, plus HST”.
                  </p>
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Paid as follows</label>
                  <input className={inputCls} placeholder="e.g. a flat fee of $5,000" value={coopPayText} onChange={(e) => setCoopPayText(e.target.value)} />
                </div>
              )}
            </>
          )}
          <p className="text-sm text-gray-500">
            Selling brokerage: <span className="font-medium">{sellingBrokerage}</span>
            {sellingAgent ? ` (${sellingAgent})` : ''} · Listing brokerage:{' '}
            <span className="font-medium">{listingBrokerage}</span>
            {listingAgent ? ` (${listingAgent})` : ''}
          </p>
        </div>

        {/* LIBRARY */}
        <div className={tab === 'library' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>Add from the Library</h2>
          <p className="text-sm text-gray-600">
            Anything from your Documents folders attaches to this package as-is — disclosures
            and the like. Mark it signed under Package Files when the signed copy comes back.
          </p>
          {!libLoaded && <p className="text-sm text-gray-400">Loading the library…</p>}
          {libLoaded && libFiles.length === 0 && (
            <p className="text-sm text-gray-400">No library files found.</p>
          )}
          <div className="space-y-2">
            {libFiles.map((f) => (
              <div key={f.path} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                <span className="text-sm">
                  {f.name}
                  <span className="text-gray-400"> · {f.folder} folder</span>
                </span>
                <button
                  onClick={() => attachLibrary(f)}
                  className="ml-auto text-xs border rounded-md px-2 py-1 hover:bg-gray-100 transition whitespace-nowrap"
                >
                  Add to package
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* PACKAGE FILES */}
        <div className={tab === 'files' ? sectionCls : 'hidden'}>
          <h2 className={h2Cls}>Package Files</h2>
          <p className="text-sm text-gray-600">
            Everything in this package, signed kept apart from unsigned — so the whole
            unsigned set can go out together when iinked Sign connects.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {(['Unsigned', 'Signed'] as const).map((group) => {
              const docs = pkgDocs.filter((d) => (group === 'Signed' ? d.signed : !d.signed))
              return (
                <div key={group}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {group}
                  </p>
                  <div className="space-y-2">
                    {docs.length === 0 && (
                      <p className="text-sm text-gray-400">
                        {group === 'Signed' ? 'Nothing signed yet.' : 'Nothing unsigned.'}
                      </p>
                    )}
                    {docs.map((doc) => (
                      <div key={doc.path} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                        <button
                          onClick={async () => {
                            try {
                              const data = await pkgAct({ action: 'file_url', id: packageId, path: doc.path })
                              window.open(data.url, '_blank')
                            } catch (e: any) {
                              setActionNote(e.message)
                            }
                          }}
                          className="text-sm text-blue-700 underline text-left"
                        >
                          {doc.filename}
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const data = await pkgAct({
                                action: 'set_doc_signed',
                                id: packageId,
                                path: doc.path,
                                signed: !doc.signed,
                              })
                              setPkgDocs(data.documents || [])
                            } catch (e: any) {
                              setActionNote(e.message)
                            }
                          }}
                          className="ml-auto text-xs border rounded-md px-2 py-1 hover:bg-gray-100 transition whitespace-nowrap"
                        >
                          {doc.signed ? 'Move to unsigned' : 'Mark signed'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => pkgFileRef.current?.click()}
              className="text-sm border px-3 py-1.5 rounded-md hover:bg-gray-100 transition"
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
          <input ref={pkgFileRef} type="file" className="hidden" onChange={onPkgAddFile} />
        </div>

        {/* ACTIONS — preview / download / save for the active form tab */}
        <div className={`space-y-4 ${tab === 'library' || tab === 'files' ? 'hidden' : ''}`}>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={previewForm}
              disabled={generating}
              className="bg-black text-white px-5 py-3 rounded-xl hover:bg-gray-800 transition disabled:opacity-50"
            >
              {generating ? 'Building…' : `Preview ${formLabel()}`}
            </button>
            <button
              onClick={() => saveForm()}
              disabled={generating}
              className="border px-5 py-3 rounded-xl hover:bg-gray-100 transition disabled:opacity-50"
            >
              Save to package
            </button>
          </div>
          {missing.length > 0 && (
            <div className="border border-red-300 bg-red-50 rounded-md p-4">
              <p className="text-sm font-medium text-red-700">Still needed:</p>
              <ul className="list-disc pl-6 text-sm text-red-700 mt-1">
                {missing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={previewAnyway}
                  disabled={generating}
                  className="bg-black text-white px-4 py-2 rounded-md text-sm hover:bg-gray-800 transition disabled:opacity-50"
                >
                  Preview anyway with what I have
                </button>
                <button
                  onClick={() => saveForm(true)}
                  disabled={generating}
                  className="border px-4 py-2 rounded-md text-sm hover:bg-gray-100 transition disabled:opacity-50"
                >
                  Save anyway
                </button>
              </div>
              <p className="text-xs text-red-600 mt-2">
                The PDF comes out with the missing pieces left blank, to finish right in the
                PDF.
              </p>
            </div>
          )}
          {genError && <p className="text-sm text-red-600">{genError}</p>}
          {actionNote && <p className="text-sm text-gray-700">{actionNote}</p>}
          {partialNote && <p className="text-sm text-amber-700">{partialNote}</p>}
          {results.length > 0 && (
            <div className="border border-green-300 bg-green-50 rounded-md p-4 space-y-2">
              <p className="text-sm font-medium text-green-800">
                Ready — the PDF is editable. Download it, or save it into the package.
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
          {previewUrl && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Preview — {previewName}</p>
              <iframe
                src={previewUrl}
                className="w-full border rounded-xl"
                style={{ height: '720px' }}
                title={previewName}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabaseClient'

type ParsedRow = Record<string, any>

type DuplicateMode = 'skip' | 'update' | 'create'

const CONTACT_FIELDS = [
  'first_name',
  'last_name',
  'preferred_name',
  'email',
  'secondary_email',
  'phone',
  'secondary_phone',
  'birthday',
  'home_purchase_date',
  'lifecycle_stage',
  'source',
  'original_source',
  'address',
  'city',
  'province',
  'postal_code',
  'marital_status',
  'spouse_name',
  'tags',
  'import_notes'
]

export default function ImportContactsPage() {
  const router = useRouter()

  const [csvRows, setCsvRows] = useState<ParsedRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [profiles, setProfiles] = useState<{ id: string; full_name: string }[]>([])
const [loading, setLoading] = useState(false)
const [isOwner, setIsOwner] = useState(false)
const [currentUserId, setCurrentUserId] = useState('')
  const [previewCount, setPreviewCount] = useState(0)
const [duplicateCount, setDuplicateCount] = useState(0)
const [previewReady, setPreviewReady] = useState(false)
const initializeUser = async () => {
  const auth = await supabase.auth.getUser()
const user = auth?.data?.user

console.log("IMPORT STEP 1.5 auth user", user)

if (!user) {
  console.log("IMPORT ERROR: no auth user")
  return
}
  if (!user) return

  setCurrentUserId(user.id)

 const { data: membership, error: membershipError } = await supabase
  .from('account_users')
  .select('account_id, role')
  .eq('user_id', user.id)
  .single()

console.log("IMPORT STEP 2.5 membership lookup", membership, membershipError)

if (membershipError) {
  console.log("IMPORT ERROR: membership lookup failed", membershipError)
  setLoading(false)
  return
}

if (!membership) {
  console.log("IMPORT ERROR: membership missing")
  setLoading(false)
  return
}

  const owner = membership.role === 'owner'
  setIsOwner(owner)

  if (!owner) {
    setAssignedUserId(user.id)
  }
}

useEffect(() => {
  initializeUser()
}, [])

const loadProfiles = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')

  if (error) {
    console.log('Error loading profiles:', error)
    return
  }

  setProfiles(data || [])
}
  const handleFile = (file: File) => {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results: Papa.ParseResult<ParsedRow>) => {

     const rows = results.data as ParsedRow[]
const rawFields = results.meta.fields || []

// remove duplicate headers
const fields: string[] = []
const seen = new Set<string>()

rawFields.forEach(h => {
  const normalized = h.trim()
  if (!seen.has(normalized)) {
    seen.add(normalized)
    fields.push(normalized)
  }
})

setCsvRows(rows)
setHeaders(fields)

const autoMapping: Record<string, string> = {}

fields.forEach(header => {
  const normalized = header.toLowerCase().trim()

  CONTACT_FIELDS.forEach(field => {
    if (field === normalized) {
      autoMapping[field] = header
    }
  })
})

setMapping(autoMapping)

      setMapping(autoMapping)
    }
  })
}

  const detectDuplicates = async (
  rows: ParsedRow[],
  accountId: string
) => {

  if (!mapping.email) {
    console.log("No email mapping — skipping duplicate detection")
    return 0
  }
const emailColumn = mapping.email

if (!emailColumn) {
  console.log("Duplicate detection skipped: no email column mapped")
  return 0
}

const emails = rows
  .map(r => r[emailColumn])
  .filter(Boolean)
  .map((e: string) => String(e).toLowerCase().trim())
  .slice(0, 200)

if (!emails.length) {
  return 0
}
  const { data, error } = await supabase
    .from('contacts')
    .select('email')
    .eq('account_id', accountId)
    .in('email', emails)

  if (error) {
    console.log("Duplicate check error:", error)
    return 0
  }

  return data?.length || 0
}

const runPreview = async () => {

  console.log("STEP 1: preview clicked")

  if (!csvRows.length) {
    alert('Please upload a CSV file first.')
    return
  }

  console.log("STEP 2: csv rows found", csvRows.length)

  const auth = await supabase.auth.getUser()
const user = auth?.data?.user

console.log("IMPORT STEP 1.5 auth user", user)

if (!user) {
  console.log("IMPORT ERROR: no auth user")
  return
}
  console.log("STEP 3: auth user", user)

  if (!user) {
    alert("Auth user missing")
    return
  }

  const { data: membership, error } = await supabase
    .from('account_users')
    .select('account_id, role')
    .eq('user_id', user.id)
    .single()

  console.log("STEP 4: membership", membership, error)
  console.log("STEP 4.5 reached")

  if (!membership) {
    alert("No account membership found")
    return
  }

  const owner = membership.role === 'owner'
  setIsOwner(owner)
  setCurrentUserId(user.id)

    if (!owner) {
    setAssignedUserId(user.id)
  }


  console.log("STEP 4.6 about to call detectDuplicates")

const duplicates = await detectDuplicates(
  csvRows,
  membership.account_id
)

console.log("STEP 4.7 detectDuplicates finished")
  console.log("STEP 5: duplicates", duplicates)

  setDuplicateCount(duplicates)
  setPreviewCount(csvRows.length)

  console.log("STEP 6: preview state set")

}
  
  const normalizeBoolean = (value: any) => {
    if (!value) return false
    const v = String(value).toLowerCase()
    return v === 'true' || v === 'yes' || v === '1'
  }

const runImport = async () => {

  console.log("IMPORT STEP 1: import button clicked")

  setLoading(true)

  const auth = await supabase.auth.getUser()
const user = auth?.data?.user

console.log("IMPORT STEP 2: auth user", user)

if (!user) {
  console.log("IMPORT ERROR: no auth user")
  setLoading(false)
  return
}

  const { data: membership, error: membershipError } = await supabase
  .from('account_users')
  .select('account_id, role')
  .eq('user_id', user.id)
  .single()

console.log("IMPORT STEP 2.5 membership result", membership)
console.log("IMPORT STEP 2.6 membership error", membershipError)

if (membershipError) {
  console.log("IMPORT ERROR: membership query failed", membershipError)
  setLoading(false)
  return
}

if (!membership) {
  console.log("IMPORT ERROR: membership missing")
  setLoading(false)
  return
}

  const isOwnerUser = membership.role === 'owner'

 const emails = csvRows
  .map(r => {
    const col = mapping.email
    if (!col) return null
    const v = r[col]
    if (!v) return null
    return String(v).toLowerCase().trim()
  })
  .filter(Boolean)
  .slice(0, 200)

  let existingMap: Record<string, string> = {}

  if (emails.length > 0) {
  console.log("IMPORT STEP 2.7 checking existing contacts", emails.length)

  const { data: existingContacts, error: existingError } = await supabase
    .from('contacts')
    .select('id, email')
    .eq('account_id', membership.account_id)
    .in('email', emails)

  console.log("IMPORT STEP 2.8 existing contacts result", existingContacts)
  console.log("IMPORT STEP 2.9 existing contacts error", existingError)

  if (existingError) {
    console.log("IMPORT ERROR: existing contact lookup failed", existingError)
    setLoading(false)
    return
  }

  existingContacts?.forEach(c => {
    existingMap[c.email.toLowerCase()] = c.id
  })
}

  const batchSize = 500
  const rows = [...csvRows]
  console.log("IMPORT STEP 3: starting batch inserts", rows.length)
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)

    const prepared = batch.map(row => {
      const contact: any = {
        account_id: membership.account_id,
        created_by: user.id,
        assigned_user_id: isOwnerUser ? assignedUserId : user.id,
        lifecycle_stage: isOwnerUser
          ? (row[mapping.lifecycle_stage] || 'Prospect')
          : 'Sphere',
        email_opt_in: true,
        sms_opt_in: false,
        do_not_contact: false
      }

      CONTACT_FIELDS.forEach(field => {
        const csvCol = mapping[field]
        if (!csvCol) return

        let value = row[csvCol]

        if (field === 'email' && value) {
          value = String(value).toLowerCase().trim()
        }

        if (field === 'tags' && value) {
          value = String(value).split(',').map((t: string) => t.trim())
        }

        contact[field] = value || null
      })

      return contact
    })

    if (duplicateMode === 'update') {
      for (const contact of prepared) {
        if (!contact.email) continue

        const existingId = existingMap[contact.email]

        if (existingId) {
          await supabase
            .from('contacts')
            .update(contact)
            .eq('id', existingId)
        } else {
          await supabase.from('contacts').insert([contact])
        }
      }
    }

    else if (duplicateMode === 'skip') {

  const inserts = prepared.filter(contact => {
    if (!contact.email) return false
    return !existingMap[contact.email]
  })

  if (inserts.length) {
    console.log("IMPORT inserting batch size:", inserts.length)
    await supabase.from('contacts').insert(inserts)
  }

}

    else {
      await supabase.from('contacts').insert(prepared)
    }
  }

  setLoading(false)
  alert('Import complete')
  router.push('/dashboard/contacts')
}
  return (
    <div className="min-h-screen bg-gray-50 p-10">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-8 space-y-8">

        <div className="space-y-6">

  <div>
    <h1 className="text-2xl font-semibold">Import Contacts</h1>
    <p className="text-gray-600 mt-2">
      Import contacts from another CRM using a CSV file. Most CRMs such as
      FollowUpBoss, HubSpot, LionDesk, Google Contacts, and Excel allow CSV export.
    </p>
  </div>

  <div className="bg-gray-50 border rounded-lg p-6 space-y-4">

    <div>
      <h2 className="font-semibold text-lg">Step 1 — Download Template</h2>
      <p className="text-sm text-gray-600">
        Use our template to make sure your columns match the CRM fields.
      </p>

      <a
        href="/contact-import-template.csv"
        download
        className="inline-block mt-3 border border-gray-300 bg-white px-4 py-2 rounded-md hover:bg-gray-50 text-sm font-medium"
      >
        Download Template CSV
      </a>
    </div>

    <div>
      <h2 className="font-semibold text-lg">Step 2 — Upload CSV File</h2>
      <p className="text-sm text-gray-600">
        After uploading your file you will be able to preview and map columns.
      </p>

      <div className="space-y-3">

  <label className="block text-sm font-medium text-gray-700">
    Upload CSV File
  </label>

  <div className="flex items-center gap-4">

    <label className="bg-black text-white px-4 py-2 rounded-md cursor-pointer hover:bg-gray-800 transition text-sm">
      Choose CSV File
      <input
        type="file"
        accept=".csv"
        onChange={(e) => e.target.files && handleFile(e.target.files[0])}
        className="hidden"
      />
    </label>

    {csvRows.length > 0 && (
      <span className="text-sm text-gray-500">
        {csvRows.length} rows detected
      </span>
    )}

  </div>

</div>
    </div>

  </div>

</div>

        {headers.length > 0 && (
          <>
            <h2 className="font-semibold">Map Fields</h2>
            {/* CSV Preview */}
<div className="mt-4 border rounded overflow-x-auto">
  <table className="w-full text-sm">
    <thead className="bg-gray-100">
      <tr>
        {headers.map(header => (
          <th key={header} className="px-3 py-2 text-left font-semibold">
            {header}
          </th>
        ))}
      </tr>
    </thead>

    <tbody>
      {csvRows.slice(0, 20).map((row, i) => (
        <tr key={i} className="border-t">
          {headers.map(header => (
            <td key={header} className="px-3 py-2">
              {row[header]}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>

  <div className="p-2 text-xs text-gray-500">
    Showing first 20 rows of {csvRows.length} total
  </div>
</div>

            {CONTACT_FIELDS.map(field => (
              <div key={field} className="flex gap-4 items-center">
                <div className="w-1/3">{field}</div>
                <select
                  className="border rounded px-2 py-1"
                  value={mapping[field] || ''}
                  onChange={(e) =>
                    setMapping(prev => ({ ...prev, [field]: e.target.value }))
                  }
                >
                  <option value="">-- None --</option>
                  {headers.map(header => (
                    <option key={header}>{header}</option>
                  ))}
                </select>
              </div>
            ))}

            <div className="mt-6 space-y-4">

              {isOwner && (
  <div>
    <label className="block font-semibold mb-1">Assign All To</label>
    <select
      className="border rounded px-3 py-2 w-full"
      value={assignedUserId}
      onChange={(e) => setAssignedUserId(e.target.value)}
      onFocus={loadProfiles}
    >
      <option value="">Select user</option>
      {profiles.map(p => (
        <option key={p.id} value={p.id}>
          {p.full_name}
        </option>
      ))}
    </select>
  </div>
)}

<div>
  <label className="block font-semibold mb-1">If duplicate email found:</label>
  <select
    className="border rounded px-3 py-2 w-full"
    value={duplicateMode}
    onChange={(e) => setDuplicateMode(e.target.value as DuplicateMode)}
  >
    <option value="skip">Skip existing</option>
    <option value="update">Update existing</option>
    <option value="create">Create anyway</option>
  </select>
</div>

<button
  onClick={runPreview}
  className="bg-gray-800 text-white px-4 py-2 rounded"
>
  Run Preview
</button>

{previewCount > 0 && (
  <div className="border rounded-lg bg-gray-50 p-6 grid grid-cols-3 gap-6 text-center">

    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide">
        Rows Detected
      </p>
      <p className="text-2xl font-semibold mt-1">
        {previewCount}
      </p>
    </div>

    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide">
        Duplicates Found
      </p>
      <p className="text-2xl font-semibold mt-1">
        {duplicateCount}
      </p>
    </div>

    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide">
        New Contacts
      </p>
      <p className="text-2xl font-semibold mt-1">
        {previewCount - duplicateCount}
      </p>
    </div>

  </div>
)}

{previewCount > 0 && (
  <button
    onClick={runImport}
    disabled={loading}
    className="px-6 py-3 rounded text-white bg-black hover:bg-gray-800 transition"
  >
    {loading ? 'Importing...' : 'Import Contacts'}
  </button>
)}

            </div>
          </>
        )}

      </div>
    </div>
  )
}
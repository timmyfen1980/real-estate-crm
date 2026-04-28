'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function AccountPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')

  const [accountId, setAccountId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [accountName, setAccountName] = useState('')
  const [brokerage, setBrokerage] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [brokerageLogoUrl, setBrokerageLogoUrl] = useState<string | null>(null)
  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null)

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [brokerageLogoFile, setBrokerageLogoFile] = useState<File | null>(null)
  const [teamLogoFile, setTeamLogoFile] = useState<File | null>(null)
const [emailHeaderFile, setEmailHeaderFile] = useState<File | null>(null)
const [emailHeaderUrl, setEmailHeaderUrl] = useState<string | null>(null)
  const [teamEnabled, setTeamEnabled] = useState(false)
  const [teamName, setTeamName] = useState('')

  const [originalData, setOriginalData] = useState<any>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [profileEditing, setProfileEditing] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setEmail(user.email || '')
      setFullName(user.user_metadata?.full_name || '')
      setPhone(user.user_metadata?.phone || '')

      const { data: membership } = await supabase
  .from('account_users')
  .select('account_id, role')
  .eq('user_id', user.id)
  .maybeSingle()
      if (!membership) {
        setLoading(false)
        return
      }

      setAccountId(membership.account_id)
setUserRole(membership.role)

     // 🔥 Load agent-level data from profiles
const { data: profile } = await supabase
  .from('profiles')
  .select('full_name, agent_photo_url, phone')
  .eq('id', (await supabase.auth.getUser()).data.user?.id)
  .single()
const { data: account } = await supabase
  .from('accounts')
  .select(
    'brokerage_name, brokerage_logo_url, team_enabled, team_name, team_logo_url, invite_code, email_header_image_url'
  )
  .eq('id', membership.account_id)
  .maybeSingle()
if (profile) {
  const loaded = {
    name: profile.full_name || '',
    brokerage: '',
    invite: '',
    logo: profile.agent_photo_url || null,
    brokerageLogo: null,
    teamEnabled: false,
    teamName: '',
    teamLogo: null,
    phone: profile.phone || '',
  }

  setAccountName(loaded.name)
setLogoUrl(loaded.logo)
setPhone(loaded.phone)

// 🔥 restore team data
if (account) {
  setBrokerage(account.brokerage_name || '')
  setBrokerageLogoUrl(account.brokerage_logo_url || '')
  setTeamEnabled(account.team_enabled || false)
  setTeamName(account.team_name || '')
  setTeamLogoUrl(account.team_logo_url || '')
  setInviteCode(account.invite_code || '')
  setEmailHeaderUrl(account.email_header_image_url || '')
}

setOriginalData(loaded)
}

      setLoading(false)
    }

    loadData()
  }, [router])

  const hasChanges =
  originalData &&
  (
    accountName !== originalData.name ||
    brokerage !== originalData.brokerage ||
    phone !== originalData.phone ||
    logoFile ||
    brokerageLogoFile ||
    teamEnabled !== originalData.teamEnabled ||
    teamName !== originalData.teamName ||
    teamLogoFile ||
    emailHeaderFile
  )

  const uploadFile = async (file: File, path: string) => {
    await supabase.storage.from('account-assets').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('account-assets').getPublicUrl(path)
    return data.publicUrl
  }

  const handleSave = async () => {
    if (!accountId) return

    setSaving(true)
    setMessage(null)

    let newLogoUrl = logoUrl
    let newBrokerageLogoUrl = brokerageLogoUrl
    let newTeamLogoUrl = teamLogoUrl
    let newEmailHeaderUrl = emailHeaderUrl

    if (logoFile) {
  newLogoUrl = await uploadFile(
    logoFile,
    `${accountId}/agents/${Date.now()}-${logoFile.name}`
  )
}

    if (brokerageLogoFile) {
  newBrokerageLogoUrl = await uploadFile(
    brokerageLogoFile,
    `${accountId}/brokerage-logo.${brokerageLogoFile.name.split('.').pop()}`
  )
}

if (teamLogoFile) {
  newTeamLogoUrl = await uploadFile(
    teamLogoFile,
    `${accountId}/team-logo.${teamLogoFile.name.split('.').pop()}`
  )
}

if (emailHeaderFile) {
  newEmailHeaderUrl = await uploadFile(
    emailHeaderFile,
    `${accountId}/email-header-${Date.now()}-${emailHeaderFile.name}`
  )
}

const {
  data: { user },
} = await supabase.auth.getUser()

if (!user) return

const { error: updateError } = await supabase
  .from('profiles')
  .update({
    full_name: accountName,
    agent_photo_url: newLogoUrl,
    phone: phone,
  })
  .eq('id', user.id)

if (updateError) {
  console.error('PROFILE UPDATE ERROR:', updateError)
  setSaving(false)
  setMessage('Error saving changes.')
  return
}

// 🔥 Only allow owner to update team-level account data
if (userRole === 'owner') {
  const { error: accountError } = await supabase
    .from('accounts')
   .update({
  name: accountName,
  brokerage_name: brokerage,
  logo_url: newLogoUrl,
  brokerage_logo_url: newBrokerageLogoUrl,
  team_enabled: teamEnabled,
  team_name: teamEnabled ? teamName : null,
  team_logo_url: teamEnabled ? newTeamLogoUrl : null,
  email_header_image_url: newEmailHeaderUrl,
  phone: phone,
})
    .eq('id', accountId)

  if (accountError) {
    console.error('ACCOUNT UPDATE ERROR:', accountError)
  }
}

console.log('UPDATED ACCOUNT ID:', accountId)

if (updateError) {
  console.error('ACCOUNT UPDATE ERROR:', updateError)
  setSaving(false)
  setMessage('Error saving changes.')
  return
}

setLogoUrl(newLogoUrl)
setBrokerageLogoUrl(newBrokerageLogoUrl)
setTeamLogoUrl(newTeamLogoUrl)
setEmailHeaderUrl(newEmailHeaderUrl)

setLogoFile(null)
setBrokerageLogoFile(null)
setTeamLogoFile(null)
setEmailHeaderFile(null)

setSaving(false)
setMessage('Changes saved successfully.')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    )
  }

  const renderLogoBlock = (
    title: string,
    file: File | null,
    url: string | null,
    setFile: (file: File | null) => void,
    inputId: string
  ) => (
    <div>
      <p className="text-sm font-semibold mb-4">{title}</p>

      <div className="border border-gray-300 rounded-lg h-44 flex items-center justify-center bg-gray-50 mb-4 overflow-hidden">
        {file ? (
          <img src={URL.createObjectURL(file)} className="max-h-36 object-contain" />
        ) : url ? (
          <img src={url} className="max-h-36 object-contain" />
        ) : (
          <span className="text-gray-400 text-sm">No logo uploaded</span>
        )}
      </div>

      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) =>
          e.target.files && setFile(e.target.files[0])
        }
      />

      <button
        type="button"
        onClick={() =>
          document.getElementById(inputId)?.click()
        }
        className="px-6 py-3 border border-gray-900 text-sm font-medium hover:bg-gray-900 hover:text-white transition rounded-md"
      >
        {file ? 'Change Logo' : 'Upload Logo'}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-white px-12 py-16">
      <div className="max-w-5xl mx-auto">

        <h1 className="text-4xl font-semibold mb-2">
          Workspace Settings
        </h1>
        <p className="text-gray-500 mb-12">
          Manage your profile, branding, and team configuration.
        </p>

        {message && (
          <div className="mb-8 border border-black px-6 py-4 text-sm">
            {message}
          </div>
        )}

        <div className="border border-black p-10 mb-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-semibold">Profile</h2>
            {!profileEditing ? (
              <button
                type="button"
                onClick={() => setProfileEditing(true)}
                className="text-sm underline"
              >
                Edit
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setFullName(email ? fullName : '')
                  setPhone(phone)
                  setProfileEditing(false)
                }}
                className="text-sm text-gray-500"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <label className="text-sm font-medium block mb-2">Email</label>
              <div className="w-full border border-gray-200 bg-gray-50 p-3 text-gray-600">
                {email}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">Full Name</label>
              {profileEditing ? (
                <input
                  className="w-full border border-gray-300 focus:border-black p-3 transition"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              ) : (
                <div className="w-full border border-gray-200 bg-gray-50 p-3">
                  {fullName || '—'}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">Phone</label>
              {profileEditing ? (
                <input
                  className="w-full border border-gray-300 focus:border-black p-3 transition"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              ) : (
                <div className="w-full border border-gray-200 bg-gray-50 p-3">
                  {phone || '—'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Everything below unchanged */}

        <div className="border border-black p-10 mb-12">
  <h2 className="text-xl font-semibold mb-8">Branding</h2>

  {/* HERO IMAGE - TOP RIGHT LAYOUT */}
<div className="mb-12 flex items-start justify-between gap-10">

  {/* LEFT: LABEL + UPLOAD */}
  <div className="w-1/2">
    <p className="text-sm font-semibold mb-4">
      Team Photo (Hero Image)
    </p>

    <input
      id="emailHeaderUpload"
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) =>
        e.target.files && setEmailHeaderFile(e.target.files[0])
      }
    />

    <button
      type="button"
      onClick={() =>
        document.getElementById('emailHeaderUpload')?.click()
      }
      className="px-6 py-3 border border-gray-900 text-sm font-medium hover:bg-gray-900 hover:text-white transition rounded-md"
    >
      {emailHeaderFile ? 'Change Image' : 'Upload Image'}
    </button>

    <p className="text-xs text-gray-500 mt-3">
      This image appears at the top of all outgoing emails.
    </p>
  </div>

  {/* RIGHT: LARGE PREVIEW */}
  <div className="w-1/2 flex justify-end">
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-gray-50 w-full max-w-sm h-48 flex items-center justify-center">
      {emailHeaderFile ? (
        <img
          src={URL.createObjectURL(emailHeaderFile)}
          className="w-full h-full object-cover"
        />
      ) : emailHeaderUrl ? (
        <img
          src={emailHeaderUrl}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-gray-400 text-sm">No image uploaded</span>
      )}
    </div>
  </div>

</div>

  {/* BELOW: NORMAL GRID */}
  <div className="grid grid-cols-2 gap-12">
    {renderLogoBlock('Agent Logo', logoFile, logoUrl, setLogoFile, 'agentLogoUpload')}

    <div>
      <label className="text-sm font-medium block mb-2">
        Brokerage Name
      </label>
      <input
        className="w-full border border-black p-3 mb-6"
        value={brokerage}
        onChange={(e) => setBrokerage(e.target.value)}
      />

      {renderLogoBlock(
        'Brokerage Logo',
        brokerageLogoFile,
        brokerageLogoUrl,
        setBrokerageLogoFile,
        'brokerageLogoUpload'
      )}
    </div>
  </div>
</div>

       <div className="border border-black p-10 mb-12">
  <h2 className="text-xl font-semibold mb-8">Team</h2>

  {/* Enable Team Toggle */}
  <label className="flex items-center mb-6">
    <input
      type="checkbox"
      checked={teamEnabled}
      onChange={(e) => setTeamEnabled(e.target.checked)}
      className="mr-2"
    />
    Enable Team
  </label>

  {teamEnabled && (
    <>
      <div className="grid grid-cols-2 gap-12 mb-10">
        <div>
          <label className="text-sm font-medium block mb-2">Team Name</label>
          <input
            className="w-full border border-black p-3"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
        </div>

        {renderLogoBlock(
          'Team Logo',
          teamLogoFile,
          teamLogoUrl,
          setTeamLogoFile,
          'teamLogoUpload'
        )}
      </div>

      {userRole === 'owner' && (
        <div>
          <p className="text-sm font-medium mb-2">Team Invite Code</p>
          <div className="border border-black p-4 flex justify-between items-center">
            <span className="tracking-widest">{inviteCode}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(inviteCode)
                setInviteCopied(true)
                setTimeout(() => setInviteCopied(false), 2000)
              }}
              className="text-sm underline"
            >
              {inviteCopied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </>
  )}
</div>

<button
  onClick={handleSave}
  disabled={!hasChanges || saving}
  className={`px-10 py-4 transition ${
    hasChanges
      ? 'bg-black text-white hover:bg-gray-900'
      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
  }`}
>
  {saving ? 'Saving...' : 'Save Changes'}
</button>

</div>
</div>
)
}
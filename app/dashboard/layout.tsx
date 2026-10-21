'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import ReaChat from '@/app/components/ReaChat'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  Building2,
  ChevronDown,
  DoorOpen,
  FileText,
  Eraser,
  FolderOpen,
  Gift,
  Handshake,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  ListChecks,
  ListTodo,
  Mail,
  UserPlus,
  Users,
} from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  const [checking, setChecking] = useState(true)

const [userEmail, setUserEmail] = useState<string | null>(null)
const [userInitials, setUserInitials] = useState<string>('')
const [userName, setUserName] = useState<string>('')
const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null)
const [userPhotoError, setUserPhotoError] = useState(false)

const [accountId, setAccountId] = useState<string | null>(null)
const [userRole, setUserRole] = useState<string | null>(null)

const [overdueCount, setOverdueCount] = useState(0)
const [newLeadsCount, setNewLeadsCount] = useState(0)
const [taskCount, setTaskCount] = useState(0)
const [closedBuyers, setClosedBuyers] = useState(0)
const [closedSellers, setClosedSellers] = useState(0)
const [closedLeases, setClosedLeases] = useState(0)
const [totalClosed, setTotalClosed] = useState(0)
const [teamBuyers, setTeamBuyers] = useState(0)
const [teamSellers, setTeamSellers] = useState(0)
const [teamLeases, setTeamLeases] = useState(0)
const [teamTotal, setTeamTotal] = useState(0)

const [loggingOut, setLoggingOut] = useState(false)
const [emailsOpen, setEmailsOpen] = useState(false)
  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      if (!user.email_confirmed_at) {
        router.push('/verify-email')
        return
      }

      setUserEmail(user.email || null)
      const { data: profile } = await supabase
  .from('profiles')
  .select('full_name, agent_photo_url')
  .eq('id', user.id)
  .single()

if (profile?.full_name) {
  setUserName(profile.full_name)
  const parts = profile.full_name.split(' ')
  const initials = parts.map((p: string) => p[0]).join('').toUpperCase()
  setUserInitials(initials)
}

if (profile?.agent_photo_url) {
  setUserPhotoUrl(profile.agent_photo_url)
}

      const { data: membership } = await supabase
  .from('account_users')
  .select('account_id, role')
  .eq('user_id', user.id)
  .single()

      if (!membership) return

      setAccountId(membership.account_id)
setUserRole(membership.role)

      // 🔹 Load production snapshot (YTD Closed)
      const currentYear = new Date().getFullYear()
      const startOfYear = `${currentYear}-01-01`

      const { data: closedDeals } = await supabase
  .from('deals')
  .select('deal_type')
  .eq('account_id', membership.account_id)
  .eq('assigned_user_id', user.id)
  .in('status', ['Sold Firm', 'Closed'])
  .gte('created_at', startOfYear)

if (closedDeals) {
  const buyers = closedDeals.filter(
    d => (d.deal_type || '').toLowerCase().trim() === 'buyer'
  ).length

  const sellers = closedDeals.filter(
    d => (d.deal_type || '').toLowerCase().trim() === 'seller'
  ).length

  const leases = closedDeals.filter(
    d => (d.deal_type || '').toLowerCase().trim() === 'lease'
  ).length

  setClosedBuyers(buyers)
  setClosedSellers(sellers)
  setClosedLeases(leases)
  setTotalClosed(buyers + sellers + leases)
}
      
// TEAM PRODUCTION (ALL TEAM MEMBERS)
 const { data: teamClosed } = await supabase
  .from('deals')
  .select('deal_type')
  .eq('account_id', membership.account_id)
  .in('status', ['Sold Firm', 'Closed'])
  .gte('created_at', startOfYear)

if (teamClosed) {
  const buyers = teamClosed.filter(
    d => (d.deal_type || '').toLowerCase().trim() === 'buyer'
  ).length

  const sellers = teamClosed.filter(
    d => (d.deal_type || '').toLowerCase().trim() === 'seller'
  ).length

  const leases = teamClosed.filter(
    d => (d.deal_type || '').toLowerCase().trim() === 'lease'
  ).length

  setTeamBuyers(buyers)
  setTeamSellers(sellers)
  setTeamLeases(leases)
  setTeamTotal(buyers + sellers + leases)
}
      // 🔹 Overdue Tasks Count
      const today = new Date().toISOString().split('T')[0]

     let query = supabase
  .from('tasks')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'pending')
  .not('due_date', 'is', null)
  .lt('due_date', today)

// Per-person (Tim, 2026-10-21): the overdue banner counts the
// signed-in user's OWN overdue tasks, owner included — same rule as
// the sidebar badge and the dashboard. The team picture lives on
// the Tasks page's Team view.
query = query
  .eq('account_id', membership.account_id)
  .eq('assigned_user_id', user.id)

const { count } = await query

      setOverdueCount(count || 0)
// 🔴 LEADS NEEDING ATTENTION COUNT (mirrors the Leads page category:
// New, or follow-up due/overdue, or no follow-up date and older than
// 14 days — excluding Client / Closed / Lost)
const _parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).formatToParts(new Date())
const _get = (t: string) => _parts.find(p => p.type === t)?.value || ''
const _todayStr = `${_get('year')}-${_get('month')}-${_get('day')}`
const _staleCutoff = new Date(Date.now() - 14 * 86400000).toISOString()

const { count: newLeads } = await supabase
  .from('leads')
  .select('id', { count: 'exact', head: true })
  .eq('account_id', membership.account_id)
  .eq('assigned_user_id', user.id)
  .not('status', 'in', '("Client","Closed","Lost")')
  .or(
    `status.eq.New,next_followup_date.lte.${_todayStr},and(next_followup_date.is.null,created_at.lt.${_staleCutoff})`
  )
  .or('working_with_realtor.is.null,working_with_realtor.eq.false')

setNewLeadsCount(newLeads || 0)

      // 🔹 Due Tasks Count (sidebar badge — Tim's rule, 2026-10-21: only
      // tasks due within the next 3 days or overdue are counted, so the
      // number prompts action instead of overwhelming; future tasks are
      // listed on the Tasks page under Upcoming but never counted. Plus
      // the owner's newsletter smart task when the approval rule fires).
      // Fail-quiet: any error leaves the badge on the count or hidden.
      const _plus3Date = new Date(_todayStr + 'T12:00:00')
      _plus3Date.setDate(_plus3Date.getDate() + 3)
      const _dueCutoffStr = `${_plus3Date.getFullYear()}-${String(
        _plus3Date.getMonth() + 1
      ).padStart(2, '0')}-${String(_plus3Date.getDate()).padStart(2, '0')}`
      let outstandingTasks = 0
      try {
        let pendingQuery = supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', membership.account_id)
          .eq('status', 'pending')
          .lte('due_date', _dueCutoffStr)

        // Per-person (Tim, 2026-10-21): the badge counts the signed-in
        // user's OWN due tasks, owner included — the Tasks page itself
        // still shows the whole team with names.
        pendingQuery = pendingQuery.eq('assigned_user_id', user.id)

        const { count: pendingTasks } = await pendingQuery
        outstandingTasks = pendingTasks || 0
      } catch {
        outstandingTasks = 0
      }

      if (membership.role === 'owner') {
        try {
          const res = await fetch('/api/admin/newsletter-issue')
          if (res.ok) {
            const issueData = await res.json()
            const cur = issueData?.current_issue
            const nxt = issueData?.next_issue
            const sent = issueData?.sent_this_month
            if (
              cur &&
              nxt &&
              typeof cur.approved === 'boolean' &&
              typeof nxt.approved === 'boolean' &&
              typeof cur.month_name === 'string' &&
              typeof nxt.month_name === 'string' &&
              typeof sent === 'number' &&
              !cur.approval_error &&
              !nxt.approval_error
            ) {
              const torontoDay = Number(
                new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'America/Toronto',
                  day: 'numeric',
                }).format(new Date())
              )
              if (!cur.approved && sent === 0) {
                outstandingTasks += 1
              } else if (!nxt.approved && torontoDay >= 18) {
                outstandingTasks += 1
              }
            }
          }
        } catch {
          // Fail quiet: badge keeps the plain outstanding count.
        }
      }

      setTaskCount(outstandingTasks)
      setChecking(false)
    }

    init()
  }, [router])
const handleLogout = async () => {
  setLoggingOut(true)
  await supabase.auth.signOut()
  router.push('/login')
}

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname.startsWith(path)
  }

  const emailPaths = ['/dashboard/campaigns', '/dashboard/email-health', '/dashboard/email-cleanup']
  const onEmailPage = emailPaths.some(function (p) { return pathname.startsWith(p) })

  useEffect(() => {
    if (onEmailPage) {
      setEmailsOpen(true)
    }
  }, [onEmailPage])

  const toggleEmails = () => {
    setEmailsOpen(function (prev) { return !prev })
  }

  const chevronClass = `h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${emailsOpen ? 'rotate-180' : ''}`

  const navItemClass = (path: string) =>
    `flex items-center justify-between px-4 py-2 rounded-md text-sm transition border-l-[3px] ${
      isActive(path)
        ? 'bg-[#0f2a44]/10 text-[#0f2a44] font-semibold border-[#d22630]'
        : 'text-gray-600 hover:bg-[#0f2a44]/5 border-transparent'
    }`

  const iconClass = 'h-[18px] w-[18px] shrink-0 text-[#0f2a44]'

  const sectionLabelClass = 'px-4 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400'

  const handleUserPhotoError = () => {
    setUserPhotoError(true)
  }

  const showUserPhoto = Boolean(userPhotoUrl) && !userPhotoError
  const rowOneLabel = userName || 'My Production'

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-gray-100">

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="px-6 h-[72px] border-b flex items-center gap-3">
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img
    src="https://www.thefcgroup.ca/images/team-logo.png"
    alt="Fennessey Comeau Group"
    className="h-12 w-auto shrink-0"
  />
  <span className="text-sm font-bold leading-tight text-[#0f2a44]">Fennessey Comeau Group</span>
</div>

        <nav className="px-4 py-6 space-y-1">

          <Link href="/dashboard" className={navItemClass('/dashboard')}>
            <span className="flex items-center gap-3">
              <LayoutDashboard className={iconClass} />
              <span>Dashboard</span>
            </span>
            {userRole === 'owner' && overdueCount > 0 && (
              <span className="ml-2 h-2 w-2 rounded-full bg-red-500" />
            )}
          </Link>

          <Link href="/dashboard/tasks" className={navItemClass('/dashboard/tasks')}>
            <span className="flex items-center gap-3">
              <ListTodo className={iconClass} />
              <span>Tasks</span>
            </span>
            {taskCount > 0 && (
              <span className="ml-2 text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
                {taskCount}
              </span>
            )}
          </Link>

          <div className={sectionLabelClass}>Clients</div>

          <Link href="/dashboard/leads" className={navItemClass('/dashboard/leads')}>
            <span className="flex items-center gap-3">
              <UserPlus className={iconClass} />
              <span>Leads</span>
            </span>
            {newLeadsCount > 0 && (
              <span className="ml-2 text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
                {newLeadsCount}
              </span>
            )}
          </Link>

          <Link href="/dashboard/contacts" className={navItemClass('/dashboard/contacts')}>
            <span className="flex items-center gap-3">
              <Users className={iconClass} />
              <span>Contacts</span>
            </span>
          </Link>

          <Link href="/dashboard/checklists" className={navItemClass('/dashboard/checklists')}>
            <span className="flex items-center gap-3">
              <ListChecks className={iconClass} />
              <span>Checklists</span>
            </span>
          </Link>

          <div className={sectionLabelClass}>Business</div>

          <Link href="/dashboard/deals" className={navItemClass('/dashboard/deals')}>
            <span className="flex items-center gap-3">
              <Handshake className={iconClass} />
              <span>Deals</span>
            </span>
          </Link>

          <Link href="/dashboard/properties" className={navItemClass('/dashboard/properties')}>
            <span className="flex items-center gap-3">
              <Building2 className={iconClass} />
              <span>Properties</span>
            </span>
          </Link>

          <Link href="/dashboard/open-houses" className={navItemClass('/dashboard/open-houses')}>
            <span className="flex items-center gap-3">
              <DoorOpen className={iconClass} />
              <span>Open Houses</span>
            </span>
          </Link>

          <Link href="/dashboard/offers/new" className={navItemClass('/dashboard/offers/new')}>
            <span className="flex items-center gap-3">
              <FileText className={iconClass} />
              <span>Prepare an Offer</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={toggleEmails}
            className="flex w-full items-center justify-between px-4 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400 transition hover:text-[#0f2a44]"
          >
            <span>Emails</span>
            <ChevronDown className={chevronClass} />
          </button>

          {emailsOpen && (
            <div className="space-y-1">
              <Link href="/dashboard/campaigns" className={navItemClass('/dashboard/campaigns')}>
                <span className="flex items-center gap-3">
                  <Mail className={iconClass} />
                  <span>Campaigns</span>
                </span>
              </Link>

              <Link href="/dashboard/email-health" className={navItemClass('/dashboard/email-health')}>
                <span className="flex items-center gap-3">
                  <Activity className={iconClass} />
                  <span>Email Health</span>
                </span>
              </Link>

              <Link href="/dashboard/email-cleanup" className={navItemClass('/dashboard/email-cleanup')}>
                <span className="flex items-center gap-3">
                  <Eraser className={iconClass} />
                  <span>Email Cleanup</span>
                </span>
              </Link>
            </div>
          )}

          <div className={sectionLabelClass}>Library</div>

          <Link href="/dashboard/documents" className={navItemClass('/dashboard/documents')}>
            <span className="flex items-center gap-3">
              <FolderOpen className={iconClass} />
              <span>Documents</span>
            </span>
          </Link>

          <Link href="/dashboard/brand-images" className={navItemClass('/dashboard/brand-images')}>
            <span className="flex items-center gap-3">
              <ImageIcon className={iconClass} />
              <span>Brand Images</span>
            </span>
          </Link>

          <div className={sectionLabelClass}>Tools</div>

          <Link href="/dashboard/giveaway" className={navItemClass('/dashboard/giveaway')}>
            <span className="flex items-center gap-3">
              <Gift className={iconClass} />
              <span>Giveaway</span>
            </span>
          </Link>

          <Link href="/dashboard/send-tenant-link" className={navItemClass('/dashboard/send-tenant-link')}>
            <span className="flex items-center gap-3">
              <Link2 className={iconClass} />
              <span>Tenant Link</span>
            </span>
          </Link>

        </nav>
      </aside>

      {/* Right Side */}
      <div className="flex-1 flex flex-col">

        {/* Top Header */}
        <header className="bg-white border-b px-8 py-4 flex justify-between items-center">

          {/* LEFT — Production Control Header */}
<div className="grid grid-cols-[12rem_6rem_6rem_6rem_7.5rem] items-center gap-x-12 gap-y-2 text-sm">
  <div
    className="flex items-center gap-2 min-w-0"
    title="My Year to Date Closed Production"
  >
    {showUserPhoto ? (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={userPhotoUrl || ''}
          alt={rowOneLabel}
          onError={handleUserPhotoError}
          className="h-7 w-7 rounded-full object-cover shrink-0"
        />
      </>
    ) : (
      <span className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
        {userInitials || 'U'}
      </span>
    )}
    <span className="font-semibold text-[#0f2a44] truncate">{rowOneLabel}</span>
  </div>

{/* BUYERS */}
<button
  onClick={() => router.push('/dashboard/deals')}
  className="group cursor-pointer flex items-baseline gap-2 justify-self-start transition hover:scale-[1.05]"
  title="View Closed Buyers"
>
  <span
    className={`text-xl font-bold transition ${
      closedBuyers > 0
        ? 'text-blue-600 group-hover:text-blue-700'
        : 'text-gray-300'
    }`}
  >
    {closedBuyers}
  </span>
  <span className="text-gray-500 relative">
    Buyers
  </span>
</button>

{/* SELLERS */}
<button
  onClick={() => router.push('/dashboard/deals')}
  className="group cursor-pointer flex items-baseline gap-2 justify-self-start transition hover:scale-[1.05]"
  title="View Closed Sellers"
>
  <span
    className={`text-xl font-bold transition ${
      closedSellers > 0
        ? 'text-purple-600 group-hover:text-purple-700'
        : 'text-gray-300'
    }`}
  >
    {closedSellers}
  </span>
  <span className="text-gray-500 relative">
    Sellers
  </span>
</button>

{/* LEASES */}
<button
  onClick={() => router.push('/dashboard/deals')}
  className="group cursor-pointer flex items-baseline gap-2 justify-self-start transition hover:scale-[1.05]"
  title="View Closed Leases"
>
  <span
    className={`text-xl font-bold transition ${
      closedLeases > 0
        ? 'text-amber-600 group-hover:text-amber-700'
        : 'text-gray-300'
    }`}
  >
    {closedLeases}
  </span>
  <span className="text-gray-500 relative">
    Leases
  </span>
</button>

{/* TOTAL */}
<button
  onClick={() => router.push('/dashboard/deals')}
  className="group cursor-pointer bg-black text-white px-4 py-2 rounded-md transition hover:scale-[1.05]"
  title="View All Closed Deals"
>
  <div className="flex items-baseline justify-center gap-2">
    <span className="text-lg font-bold">{totalClosed}</span>
    <span className="opacity-80">Total</span>
  </div>
</button>

  <div className="col-span-5 border-t border-gray-200" aria-hidden="true" />

  <div
    className="flex items-center gap-2 min-w-0"
    title="Team Year to Date Closed Production"
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src="https://www.thefcgroup.ca/images/team-logo.png"
      alt="Fennessey Comeau Group"
      className="h-7 w-auto shrink-0"
    />
    <span className="font-semibold tracking-wide uppercase text-gray-500">Team Production</span>
  </div>

  <div className="flex items-baseline gap-2">
    <span className="text-xl font-bold text-blue-600">{teamBuyers}</span>
    <span className="text-gray-500">Buyers</span>
  </div>

  <div className="flex items-baseline gap-2">
    <span className="text-xl font-bold text-purple-600">{teamSellers}</span>
    <span className="text-gray-500">Sellers</span>
  </div>

  <div className="flex items-baseline gap-2">
    <span className="text-xl font-bold text-amber-600">{teamLeases}</span>
    <span className="text-gray-500">Leases</span>
  </div>

  <div className="bg-[#0f2a44] text-white px-4 py-2 rounded-md">
    <div className="flex items-baseline justify-center gap-2">
      <span className="text-lg font-bold">{teamTotal}</span>
      <span className="opacity-80">Total</span>
    </div>
  </div>
</div>

          {/* RIGHT — User Controls */}
        <div className="flex flex-col items-end gap-2 pl-10">

  {/* USER AVATAR — links to Account */}
  <Link
    href="/dashboard/account"
    className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold transition hover:scale-[1.05]"
    title="Account"
  >
    {userInitials || 'U'}
  </Link>

  {/* LOGOUT */}
  <button
    onClick={handleLogout}
    disabled={loggingOut}
    className="text-sm border px-4 py-2 rounded-md hover:bg-gray-100 transition disabled:opacity-60"
  >
    {loggingOut ? 'Logging out…' : 'Logout'}
  </button>

</div>

        </header>
        {overdueCount > 0 && (
  <div className="bg-red-600 text-white px-8 py-3 flex justify-between items-center">
    <div className="font-semibold">
      ⚠ {overdueCount} Overdue Task{overdueCount > 1 ? 's' : ''} Require Attention
    </div>

    <button
      onClick={() => router.push('/dashboard')}
      className="bg-white text-red-600 px-4 py-1 rounded-md text-sm font-medium"
    >
      Review Now
    </button>
  </div>
)}
        <main className="flex-1 p-6 overflow-y-auto">

  {children}

</main>

      </div>
      <ReaChat />
    </div>
  )
}
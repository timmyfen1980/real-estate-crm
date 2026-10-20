'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  Building2,
  ChevronDown,
  DoorOpen,
  Eraser,
  FolderOpen,
  Gift,
  Handshake,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  ListChecks,
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

const [accountId, setAccountId] = useState<string | null>(null)
const [userRole, setUserRole] = useState<string | null>(null)

const [overdueCount, setOverdueCount] = useState(0)
const [newLeadsCount, setNewLeadsCount] = useState(0)
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
  .select('full_name')
  .eq('id', user.id)
  .single()

if (profile?.full_name) {
  const parts = profile.full_name.split(' ')
  const initials = parts.map((p: string) => p[0]).join('').toUpperCase()
  setUserInitials(initials)
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

if (membership.role === 'owner') {
  query = query.eq('account_id', membership.account_id)
} else {
  query = query.eq('assigned_user_id', user.id)
}

const { count } = await query

      setOverdueCount(count || 0)
// 🔴 NEW LEADS COUNT
const { count: newLeads } = await supabase
  .from('leads')
  .select('id', { count: 'exact', head: true })
  .eq('account_id', membership.account_id)
  .eq('status', 'New')

setNewLeadsCount(newLeads || 0)
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
<div className="grid grid-cols-[10rem_6rem_6rem_6rem_7.5rem] items-center gap-x-12 gap-y-2 text-sm">
  <div
    className="font-semibold tracking-wide uppercase text-gray-500"
    title="My Year to Date Closed Production"
  >
    My Production
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
    className="font-semibold tracking-wide uppercase text-gray-500"
    title="Team Year to Date Closed Production"
  >
    Team Production
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
        <div className="flex items-center gap-4 pl-10">

  {/* USER INITIALS */}
  <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
    {userInitials || 'U'}
  </div>

  {/* ACCOUNT BUTTON */}
  <Link
    href="/dashboard/account"
    className="text-sm px-4 py-2 rounded-md border border-blue-500 text-blue-600 hover:bg-blue-50 transition font-medium"
  >
    Account
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
    </div>
  )
}
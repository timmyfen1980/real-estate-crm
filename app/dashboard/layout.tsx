'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

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
  const buyers = closedDeals.filter(d => d.deal_type === 'Buyer').length
  const sellers = closedDeals.filter(d => d.deal_type === 'Seller').length

  setClosedBuyers(buyers)
  setClosedSellers(sellers)
  setClosedLeases(0)
  setTotalClosed(buyers + sellers)
}

      
// TEAM PRODUCTION (OWNER ONLY)
if (membership.role === 'owner') {
 const { data: teamClosed } = await supabase
  .from('deals')
  .select('deal_type')
  .eq('account_id', membership.account_id)
  .in('status', ['Sold Firm', 'Closed'])
  .gte('created_at', startOfYear)

if (teamClosed) {
  const buyers = teamClosed.filter(d => d.deal_type === 'Buyer').length
  const sellers = teamClosed.filter(d => d.deal_type === 'Seller').length

  setTeamBuyers(buyers)
  setTeamSellers(sellers)
  setTeamLeases(0)
  setTeamTotal(buyers + sellers)
}
    
}
      // 🔹 Overdue Tasks Count
      const today = new Date().toISOString().split('T')[0]

      let query = supabase
  .from('tasks')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'pending')
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

  const navItemClass = (path: string) =>
    `flex items-center justify-between px-4 py-2 rounded-md text-sm transition ${
      isActive(path)
        ? 'bg-black text-white'
        : 'text-gray-600 hover:bg-gray-200'
    }`

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
        <div className="px-8 h-[72px] border-b flex items-center">
  <h1 className="text-lg font-semibold">CRM Dashboard</h1>
</div>

        <nav className="px-4 py-6 space-y-2">

          <Link href="/dashboard" className={navItemClass('/dashboard')}>
            <span>Dashboard</span>
            {userRole === 'owner' && overdueCount > 0 && (
              <span className="ml-2 h-2 w-2 rounded-full bg-red-500" />
            )}
          </Link>

          <Link href="/dashboard/leads" className={navItemClass('/dashboard/leads')}>
  <div className="flex items-center justify-between w-full">
    <span>Leads</span>

    {newLeadsCount > 0 && (
      <span className="ml-2 text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
        {newLeadsCount}
      </span>
    )}
  </div>
</Link>
<Link href="/dashboard/contacts" className={navItemClass('/dashboard/contacts')}>
  Contacts
</Link>

<Link href="/dashboard/deals" className={navItemClass('/dashboard/deals')}>
  Deals
</Link>

<Link href="/dashboard/properties" className={navItemClass('/dashboard/properties')}>
  Properties
</Link>

<Link href="/dashboard/open-houses" className={navItemClass('/dashboard/open-houses')}>
  Open Houses
</Link>
        </nav>
      </aside>

      {/* Right Side */}
      <div className="flex-1 flex flex-col">

        {/* Top Header */}
        <header className="bg-white border-b px-8 h-[72px] flex justify-between items-center">

          {/* LEFT — Production Control Header */}
<div className="flex items-center gap-12 text-sm">
  <div
    className="font-semibold tracking-wide uppercase text-gray-500"
    title="Year to Date Closed Production"
  >
    {new Date().getFullYear()} Production
  </div>

  <div className="flex items-center gap-12 text-sm">

{/* BUYERS */}
<button
  onClick={() => router.push('/dashboard/deals')}
  className="group cursor-pointer flex items-baseline gap-2 transition hover:scale-[1.05]"
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
  className="group cursor-pointer flex items-baseline gap-2 transition hover:scale-[1.05]"
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
  className="group cursor-pointer flex items-baseline gap-2 transition hover:scale-[1.05]"
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
  <div className="flex items-baseline gap-2">
    <span className="text-lg font-bold">{totalClosed}</span>
    <span className="opacity-80">Total</span>
  </div>
</button>

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

{userRole === 'owner' && pathname === '/dashboard' && (
  <div className="mb-6 bg-white border rounded-2xl px-10 py-6 shadow-sm">

    <div className="flex items-center gap-12 text-sm">

      <div className="font-semibold tracking-wide uppercase text-gray-500">
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

      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold">{teamTotal}</span>
        <span className="text-gray-500">Total</span>
      </div>

    </div>

  </div>
)}

  {children}

</main>

      </div>
    </div>
  )
}
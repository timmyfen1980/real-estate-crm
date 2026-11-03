'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Lead = {
  id: string
  first_name: string
  last_name: string
  status: string
  deal_type: string | null
  source: string | null
  created_at: string
  assigned_user_id: string | null

  // ✅ NEW FIELDS (SAFE)
  next_followup_date: string | null
  last_contacted_at: string | null
}

type Property = {
  id: string
  address: string
}

type Task = {
  id: string
  title: string
  due_date: string
  priority: string
  status: string
  assigned_user_id: string
  completed_at: string | null
  source: string
  lead_id: string | null
}

type EmailFollowup = {
  id: string
  sender_name: string | null
  sender_email: string | null
  subject: string | null
  snippet: string | null
  received_at: string | null
}

type DealRow = {
  id: string
  status: string
  property_id: string | null
  closing_date: string | null
}

type ClosingDeal = {
  id: string
  address: string
  closing_date: string
  status: string
}

// YYYY-MM-DD in America/Toronto for a given instant.
function torontoDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  let year = ''
  let month = ''
  let day = ''
  parts.forEach(function (p) {
    if (p.type === 'year') year = p.value
    if (p.type === 'month') month = p.value
    if (p.type === 'day') day = p.value
  })
  return year + '-' + month + '-' + day
}

export default function Dashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState<Lead[]>([])
  const [properties, setProperties] = useState<Record<string, string>>({})
  const [tasks, setTasks] = useState<Task[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState({
    attention: false, // default open (safe fallback)
  })

  // Email follow-ups: null = card hidden (still loading, or the
  // email_followups table is unreachable) — the card fails quiet. Every
  // user sees only their own rows (scoped by user_id below).
  const [emailFollowups, setEmailFollowups] = useState<EmailFollowup[] | null>(null)

  // Ready-for-review count: null = line hidden (still loading or the
  // packages endpoint unreachable) — fails quiet like the cards above.
  const [reviewCount, setReviewCount] = useState<number | null>(null)

  // Closings Ahead: null = card hidden. No CRM code references a
  // closing_date column on deals, so the query is expected to error and
  // the card stays hidden until such a column exists — fail quiet.
  const [upcomingClosings, setUpcomingClosings] = useState<ClosingDeal[] | null>(null)

  const loadDashboard = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/')
      return
    }

    const { data: membership } = await supabase
      .from('account_users')
      .select('account_id, role')
      .eq('user_id', user.id)
      .single()

    if (!membership) return

    const accountIdValue = membership.account_id
    const owner = membership.role === 'owner'
    setIsOwner(owner)
    setCurrentUserId(user.id)

    // Email follow-ups (per user): the signed-in user's own unreplied
    // inbox mail flagged by the inbox scanners. Fail-quiet — if the
    // email_followups table does not exist yet or the query errors, the
    // dashboard renders without the card.
    try {
      const { data: followupData, error: followupError } = await supabase
        .from('email_followups')
        .select('id, sender_name, sender_email, subject, snippet, received_at')
        .eq('account_id', accountIdValue)
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('received_at', { ascending: true })
        .limit(10)
      if (!followupError) {
        setEmailFollowups(followupData || [])
      }
    } catch {
      // Fail quiet: no follow-ups card.
    }

    // Ready-for-review count (fail-quiet): packages Beth has assembled
    // and handed over, waiting in the Offers list for an agent to check.
    try {
      const pkgRes = await fetch('/api/offers/packages')
      const pkgData = await pkgRes.json()
      if (pkgData?.ok && Array.isArray(pkgData.packages)) {
        setReviewCount(
          pkgData.packages.filter((p: any) => p.status === 'in_review').length
        )
      }
    } catch {
      // Fail quiet: no review line.
    }

    const leadQuery = supabase
      .from('leads')
      .select('*')
      .eq('account_id', accountIdValue)

    const scopedLeadQuery = owner
      ? leadQuery
      : leadQuery.eq('assigned_user_id', user.id)

    const { data: leadData } = await scopedLeadQuery.order('created_at', {
      ascending: false,
    })

    setLeads(leadData || [])

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, address')
      .eq('account_id', accountIdValue)

    const propertyMap: Record<string, string> = {}
    propertyData?.forEach((p: Property) => {
      propertyMap[p.id] = p.address
    })

    setProperties(propertyMap)

    // Closings Ahead (fail-quiet): deals closing in the next 30 days.
    try {
      const nowMs = Date.now()
      const fromStr = torontoDateString(new Date(nowMs))
      const toStr = torontoDateString(new Date(nowMs + 30 * 24 * 60 * 60 * 1000))
      const { data: dealData, error: dealError } = await supabase
        .from('deals')
        .select('id, status, property_id, closing_date')
        .eq('account_id', accountIdValue)
        .neq('status', 'Closed')
        .gte('closing_date', fromStr)
        .lte('closing_date', toStr)
        .order('closing_date', { ascending: true })
        .limit(10)
      if (!dealError && dealData) {
        const dealRows = dealData as DealRow[]
        const rows: ClosingDeal[] = []
        dealRows.forEach(function (d) {
          if (!d.closing_date) return
          rows.push({
            id: d.id,
            address:
              (d.property_id && propertyMap[d.property_id]) || 'Address not set',
            closing_date: d.closing_date.slice(0, 10),
            status: d.status,
          })
        })
        setUpcomingClosings(rows)
      }
    } catch {
      // Fail quiet: no Closings Ahead card.
    }

    const taskQuery = supabase
      .from('tasks')
      .select('*')
      .eq('account_id', accountIdValue)
      .order('due_date', { ascending: true })

    // Per-person (Tim, 2026-10-21): the dashboard's task numbers and
    // overdue list are the signed-in user's OWN tasks, owner included —
    // the team picture lives on the Tasks page's Team view.
    const scopedTaskQuery = taskQuery.eq('assigned_user_id', user.id)

    const { data: taskData } = await scopedTaskQuery
    setTasks(taskData || [])
    setLoading(false)
  }

  const dismissFollowup = async (id: string) => {
    if (!currentUserId) return
    const { error } = await supabase
      .from('email_followups')
      .update({ status: 'dismissed' })
      .eq('id', id)
      .eq('user_id', currentUserId)

    if (error) {
      console.error('DISMISS FOLLOWUP ERROR:', error)
      alert('Failed to dismiss — please try again')
      return
    }

    setEmailFollowups(function (prev) {
      return prev ? prev.filter(function (item) { return item.id !== id }) : prev
    })
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading dashboard...
      </div>
    )
  }

  const today = new Date()

  const attentionLeads = leads
    .filter(l => {
      // Per-person (Tim, 2026-10-21): Needs Attention shows the
      // signed-in user's own leads only, and never hands-off
      // working-with-realtor leads.
      if (l.assigned_user_id !== currentUserId) return false
      if ((l as any).working_with_realtor) return false

      // Always show new leads
      if (l.status === 'New') return true

      // Show overdue follow-ups
      if (l.next_followup_date) {
        return new Date(l.next_followup_date) < today
      }

      return false
    })
    .slice(0, 5)

  const pendingTasksCount = tasks.filter(t => t.status === 'pending').length
  const newLeadsCount = leads.filter(
    l => l.status === 'New' && l.assigned_user_id === currentUserId
  ).length
  const overdueTasksCount = tasks.filter(
    t => t.status === 'pending' && new Date(t.due_date) < new Date()
  ).length
  const overdueTasks = tasks.filter(
    t => t.status === 'pending' && new Date(t.due_date) < new Date()
  )

  // Pre-rendered Email Follow-ups rows (handlers precomputed — no inline
  // arrow functions inside the JSX below).
  const followupRows = (emailFollowups || []).map(function (item) {
    const sender = item.sender_name || item.sender_email || 'Unknown sender'
    const subject = item.subject || '(no subject)'
    const receivedMs = item.received_at ? new Date(item.received_at).getTime() : NaN
    const receivedValid = !Number.isNaN(receivedMs)
    let waiting = ''
    if (receivedValid) {
      const diffMs = Date.now() - receivedMs
      const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
      const hours = Math.floor(diffMs / (60 * 60 * 1000))
      if (days >= 1) {
        waiting = days === 1 ? '1 day' : days + ' days'
      } else if (hours >= 1) {
        waiting = hours === 1 ? '1 hour' : hours + ' hours'
      } else {
        waiting = 'Under an hour'
      }
    }
    const receivedLabel = receivedValid
      ? new Date(receivedMs).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : ''
    const handleDismiss = function () {
      dismissFollowup(item.id)
    }
    return (
      <div
        key={item.id}
        className="py-4 flex justify-between items-start gap-4 hover:bg-gray-50 transition"
      >
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-900">{sender}</span>
            {waiting && (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                {waiting}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-900">{subject}</div>
          {item.snippet && (
            <div className="text-sm text-gray-500">{item.snippet}</div>
          )}
          {receivedLabel && (
            <div className="text-xs text-gray-400">Received {receivedLabel}</div>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="text-sm px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-100 transition whitespace-nowrap"
        >
          Dismiss
        </button>
      </div>
    )
  })

  // Closings Ahead rows (precomputed).
  const closingRows = (upcomingClosings || []).map(function (deal) {
    const dateLabel = new Date(deal.closing_date + 'T12:00:00').toLocaleDateString(
      undefined,
      {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }
    )
    return (
      <div
        key={deal.id}
        className="py-3 flex justify-between items-center gap-4"
      >
        <div className="font-medium text-gray-900">{deal.address}</div>
        <div className="text-right whitespace-nowrap">
          <div className="text-sm text-gray-900">{dateLabel}</div>
          <div className="text-xs text-gray-500">{deal.status}</div>
        </div>
      </div>
    )
  })

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-md p-4">
      <div className="space-y-4">
        {/* GETTING STARTED — one pointer line for a first-timer (Beth):
            where client documents and offers live. */}
        <p className="text-sm text-gray-500 px-1">
          New here? Client documents live in <span className="font-medium text-gray-700">Client Files</span> (sidebar).
          Offers are built under <span className="font-medium text-gray-700">Prepare an Offer</span>.
          Rea, bottom-right, can answer questions and start things for you.
        </p>

        {/* READY FOR REVIEW — shown only while packages are waiting. */}
        {reviewCount !== null && reviewCount > 0 && (
          <p className="text-sm px-1">
            <Link
              href="/dashboard/offers"
              className="font-medium text-blue-700 underline"
            >
              {reviewCount} offer package{reviewCount === 1 ? '' : 's'} ready for review →
            </Link>{' '}
            <span className="text-gray-500">waiting in Offers for an agent to check.</span>
          </p>
        )}

        {/* COMMAND BAR — PERFORMANCE MODE */}
        <div className="bg-gray-900 text-white rounded-xl px-5 py-3 flex gap-10 text-sm items-center shadow-md">
          <button
            onClick={() => router.push('/dashboard/deals/new')}
            className="bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
          >
            + New Deal
          </button>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${
              pendingTasksCount > 0 ? 'text-amber-600' : 'text-gray-400'
            }`}>
              {pendingTasksCount}
            </span>
            <span className="text-gray-300 uppercase tracking-wide text-xs">Pending</span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${
              newLeadsCount > 0 ? 'text-blue-600' : 'text-gray-400'
            }`}>
              {newLeadsCount}
            </span>
            <span className="text-gray-300 uppercase tracking-wide text-xs">New Leads</span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold ${
              overdueTasksCount > 0 ? 'text-red-600' : 'text-gray-400'
            }`}>
              {overdueTasksCount}
            </span>
            <span className="text-gray-300 uppercase tracking-wide text-xs">Overdue</span>
          </div>
        </div>

        {/* COMMAND CENTER — two columns, zero-scroll on a large desktop */}
        <div className="grid lg:grid-cols-2 gap-4 items-start">

          {/* LEFT COLUMN — what needs me */}
          <div className="space-y-4">

            {/* NEEDS ATTENTION — PERFORMANCE MODE */}
            <SectionCard
              title={
                <button
                  onClick={() =>
                    setCollapsed(prev => ({ ...prev, attention: !prev.attention }))
                  }
                  className={`flex items-center justify-between w-full text-left ${
                    (attentionLeads.length + overdueTasks.length) > 0 ? 'text-red-600 font-semibold' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    Needs Attention ({attentionLeads.length + overdueTasks.length})
                    {attentionLeads.length > 0 && (
                      <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded tracking-wider">
                        ACTION REQUIRED
                      </span>
                    )}
                  </div>

                  <span
                    className={`transition-transform ${
                      collapsed.attention ? 'rotate-0' : 'rotate-90'
                    }`}
                  >
                    ▶
                  </span>
                </button>
              }
              className={
                attentionLeads.length > 0
                  ? 'border-l-4 border-red-500 bg-red-50/30'
                  : 'border-l-4 border-gray-200'
              }
            >
              {!collapsed.attention && (
                attentionLeads.length === 0 && overdueTasks.length === 0 ? (
                  <EmptyState text="Nothing needs attention — you're all caught up." />
                ) : (
                  <div className="space-y-6">

                    {/* OVERDUE TASKS */}
                    {overdueTasks.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
                          Overdue Tasks
                        </div>

                        <div className="space-y-2">
                          {overdueTasks.map(task => (
                            <div
                              key={task.id}
                              className="p-3 border rounded-lg bg-red-50 flex justify-between items-center"
                            >
                              <div>
                                <div className="font-medium text-gray-900">
                                  {task.title}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Due {new Date(task.due_date).toLocaleDateString()}
                                </div>
                              </div>

                              <button
                                onClick={async () => {
                                  const { error: completeError } = await supabase
                                    .from('tasks')
                                    .update({
                                      status: 'completed',
                                      completed_at: new Date().toISOString(),
                                    })
                                    .eq('id', task.id)

                                  if (completeError) {
                                    console.error('COMPLETE TASK ERROR:', completeError)
                                    alert('Failed to complete task — please try again')
                                    return
                                  }

                                  loadDashboard()
                                }}
                                className="text-xs px-3 py-1 bg-green-600 text-white rounded"
                              >
                                Complete
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* LEADS */}
                    {attentionLeads.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Leads
                        </div>

                        <LeadList leads={attentionLeads} router={router} />
                      </div>
                    )}

                  </div>
                )
              )}
            </SectionCard>

            {/* EMAIL FOLLOW-UPS — per user (own rows only), fed by the
                inbox scanners. Hidden entirely until the email_followups
                table exists. */}
            {emailFollowups !== null && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                <div className="mb-4 border-b border-gray-100 pb-2">
                  <h2 className="text-xs font-semibold tracking-wider uppercase text-gray-500">
                    Email Follow-ups
                    <span className="text-sm text-gray-500 font-normal normal-case tracking-normal">
                      {' '}({emailFollowups.length})
                    </span>
                  </h2>
                </div>

                {emailFollowups.length === 0 ? (
                  <EmptyState text="Nothing waiting on you." />
                ) : (
                  <div className="divide-y divide-gray-100">
                    {followupRows}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN — closings */}
          <div className="space-y-4">

            {/* CLOSINGS AHEAD — hidden unless the deals table carries a
                closing_date column (fail-quiet query in loadDashboard). */}
            {upcomingClosings !== null && (
              <SectionCard title="Closings Ahead">
                {upcomingClosings.length === 0 ? (
                  <EmptyState text="No closings in the next 30 days." />
                ) : (
                  <div className="divide-y divide-gray-100">
                    {closingRows}
                  </div>
                )}
              </SectionCard>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  children,
  className = '',
}: {
  title: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-150 p-5 ${className}`}>
      <div className="mb-3 border-b border-gray-100 pb-2">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-gray-500">
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}

function LeadList({
  leads,
  router,
}: {
  leads: Lead[]
  router: ReturnType<typeof useRouter>
}) {
  if (!leads.length) {
    return <EmptyState text="No leads found." />
  }

  return (
    <div className="space-y-4">
      {leads.map((lead) => (
        <div
          key={lead.id}
          className="flex justify-between items-center border-b border-gray-100 py-4 cursor-pointer hover:bg-gray-50 hover:shadow-sm transition-all duration-150"
          onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
        >
          <div>
            <div className="font-medium">
              {lead.first_name} {lead.last_name}
            </div>
            <div className="text-sm text-gray-500">
              {lead.status}
              {lead.deal_type ? ` · ${lead.deal_type}` : ''}
            </div>
          </div>
          <div className="text-sm text-gray-500">
            {new Date(lead.created_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-gray-500 text-sm py-4">
      {text}
    </div>
  )
}


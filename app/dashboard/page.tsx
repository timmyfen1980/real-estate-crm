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
  const [accountId, setAccountId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState({
    attention: false, // default open (safe fallback)
  })

  // Email follow-ups: null = card hidden (not the owner, still loading, or
  // the email_followups table is unreachable) — the card fails quiet.
  const [emailFollowups, setEmailFollowups] = useState<EmailFollowup[] | null>(null)

  // Closings Ahead: null = card hidden. No CRM code references a
  // closing_date column on deals, so the query is expected to error and
  // the card stays hidden until such a column exists — fail quiet.
  const [upcomingClosings, setUpcomingClosings] = useState<ClosingDeal[] | null>(null)

  const [addedSources, setAddedSources] = useState<string[]>([])
  const [addingSource, setAddingSource] = useState<string | null>(null)

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
    setAccountId(accountIdValue)

    // Email follow-ups (owner only): unreplied inbox mail flagged by the
    // hourly scanner. Fail-quiet — if the email_followups table does not
    // exist yet or the query errors, the dashboard renders without the card.
    if (owner) {
      try {
        const { data: followupData, error: followupError } = await supabase
          .from('email_followups')
          .select('id, sender_name, sender_email, subject, snippet, received_at')
          .eq('account_id', accountIdValue)
          .eq('status', 'open')
          .order('received_at', { ascending: true })
          .limit(10)
        if (!followupError) {
          setEmailFollowups(followupData || [])
        }
      } catch {
        // Fail quiet: no follow-ups card.
      }
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

    const scopedTaskQuery = owner
      ? taskQuery
      : taskQuery.eq('assigned_user_id', user.id)

    const { data: taskData } = await scopedTaskQuery
    setTasks(taskData || [])
    setLoading(false)
  }

  const dismissFollowup = async (id: string) => {
    setEmailFollowups(function (prev) {
      return prev ? prev.filter(function (item) { return item.id !== id }) : prev
    })
    await supabase
      .from('email_followups')
      .update({ status: 'dismissed' })
      .eq('id', id)
  }

  // Pipeline Health "+ Add task": creates a real task from a dashboard
  // suggestion (same insert shape as TaskModal, source swapped).
  const addSourceTask = async (source: string) => {
    if (!currentUserId || !accountId) return
    if (addedSources.indexOf(source) >= 0) return
    setAddingSource(source)
    const { error } = await supabase.from('tasks').insert({
      title: 'Work ' + source + ': generate new leads',
      due_date: torontoDateString(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      priority: 'medium',
      status: 'pending',
      assigned_user_id: currentUserId,
      lead_id: null,
      source: 'dashboard_suggestion',
      account_id: accountId,
      created_by: currentUserId,
    })
    setAddingSource(null)
    if (!error) {
      setAddedSources(function (prev) {
        return prev.concat([source])
      })
      loadDashboard()
    }
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

      // Always show new leads
      if (l.status === 'New') return true

      // Show overdue follow-ups
      if (l.next_followup_date) {
        return new Date(l.next_followup_date) < today
      }

      return false
    })
    .slice(0, 5)

  const pipelineCounts: Record<string, number> = {}
  leads.forEach(l => {
    pipelineCounts[l.status] =
      (pipelineCounts[l.status] || 0) + 1
  })

  const predefinedSources = [
    'Open House',
    'Social Media',
    'Referral',
    'Website',
    'Event / Raffle',
    'Other',
  ]

  // Pipeline Health: "active" means still being worked.
  const ACTIVE_STATUSES = ['New', 'Contacted', 'Hot']

  const sourceActive: Record<string, number> = {}
  const sourceTotals: Record<string, number> = {}
  leads.forEach(function (l) {
    const src = l.source || 'Other'
    sourceTotals[src] = (sourceTotals[src] || 0) + 1
    if (ACTIVE_STATUSES.indexOf(l.status) >= 0) {
      sourceActive[src] = (sourceActive[src] || 0) + 1
    }
  })

  const extraSources = Object.keys(sourceTotals).filter(function (src) {
    return predefinedSources.indexOf(src) < 0
  })
  const allSources = predefinedSources.concat(extraSources)

  // Stale: active lead with an overdue follow-up, or no follow-up date
  // and untouched since creation more than 14 days ago.
  const staleCutoff = today.getTime() - 14 * 24 * 60 * 60 * 1000
  const staleLeadsCount = leads.filter(function (l) {
    if (ACTIVE_STATUSES.indexOf(l.status) < 0) return false
    if (l.next_followup_date) {
      return new Date(l.next_followup_date).getTime() < today.getTime()
    }
    return new Date(l.created_at).getTime() < staleCutoff
  }).length

  const pendingTasksCount = tasks.filter(t => t.status === 'pending').length
  const newLeadsCount = leads.filter(l => l.status === 'New').length
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

  // Pipeline Health stage strip (precomputed).
  const stageRows = ['New', 'Contacted', 'Hot', 'Cold', 'Client', 'Closed', 'Lost'].map(
    function (status) {
      const count = pipelineCounts[status] || 0
      const performanceColor =
        status === 'Hot'
          ? 'text-red-600'
          : status === 'Closed'
          ? 'text-green-600'
          : status === 'Cold'
          ? 'text-gray-400'
          : 'text-gray-800'

      return (
        <div
          key={status}
          className="rounded-lg border border-gray-200 py-3 bg-white"
        >
          <div className={`text-xl font-semibold ${performanceColor}`}>
            {count}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-0.5">
            {status}
          </div>
        </div>
      )
    }
  )

  // Pipeline Health source rows (precomputed). A source with zero active
  // leads becomes a flag with a one-tap suggested task.
  const sourceRows = allSources.map(function (src) {
    const activeCount = sourceActive[src] || 0
    if (activeCount > 0) {
      return (
        <div key={src} className="py-2 flex justify-between items-center">
          <span className="text-sm text-gray-700">{src}</span>
          <span className="text-sm text-gray-500">{activeCount} active</span>
        </div>
      )
    }
    const alreadyAdded = addedSources.indexOf(src) >= 0
    const isAdding = addingSource === src
    const handleAdd = function () {
      addSourceTask(src)
    }
    return (
      <div key={src} className="py-2 flex justify-between items-center gap-3">
        <span className="text-sm font-medium text-amber-700">
          No active {src} pipeline
        </span>
        {alreadyAdded ? (
          <span className="text-sm text-green-600 whitespace-nowrap">
            Added ✓
          </span>
        ) : (
          <button
            onClick={handleAdd}
            disabled={isAdding}
            className="text-sm px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-100 transition whitespace-nowrap disabled:opacity-50"
          >
            {isAdding ? 'Adding...' : '+ Add task'}
          </button>
        )}
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
                  <EmptyState text="Nothing needs attention." />
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
                                  await supabase
                                    .from('tasks')
                                    .update({
                                      status: 'completed',
                                      completed_at: new Date().toISOString(),
                                    })
                                    .eq('id', task.id)

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

            {/* EMAIL FOLLOW-UPS — owner only, fed by the hourly inbox scanner.
                Hidden entirely until the email_followups table exists. */}
            {isOwner && emailFollowups !== null && (
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

          {/* RIGHT COLUMN — pipeline health + closings */}
          <div className="space-y-4">

            {/* PIPELINE HEALTH — diagnostic: stage strip, per-source
                activity, empty-source flags with suggested tasks, stale
                lead flag. */}
            <SectionCard title="Pipeline Health">
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
                {stageRows}
              </div>

              <div className="mt-3 border-t border-gray-100 pt-1 divide-y divide-gray-100">
                {sourceRows}
              </div>

              {staleLeadsCount > 0 && (
                <Link
                  href="/dashboard/leads"
                  className="mt-3 flex justify-between items-center p-3 border rounded-lg bg-amber-50 hover:bg-amber-100 transition"
                >
                  <span className="text-sm font-medium text-amber-800">
                    {staleLeadsCount} stale leads need attention
                  </span>
                  <span className="text-sm font-medium text-[#0f2a44] whitespace-nowrap">
                    View {'→'}
                  </span>
                </Link>
              )}
            </SectionCard>

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

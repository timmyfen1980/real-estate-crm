'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TaskModal from '@/app/components/TaskModal'
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

type OpenHouseEvent = {
  id: string
  property_id: string
  event_date: string
  is_active: boolean
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
type Activity = {
  id: string
  type: string
  metadata: any
  created_at: string
  lead: {
    id: string
    first_name: string
    last_name: string
  }[]
  user: {
    full_name: string
  }[]
}
export default function Dashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState<Lead[]>([])
  const [activeEvents, setActiveEvents] = useState<OpenHouseEvent[]>([])
  const [properties, setProperties] = useState<Record<string, string>>({})
  const [tasks, setTasks] = useState<Task[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
const [isOwner, setIsOwner] = useState(false)
const [currentUserId, setCurrentUserId] = useState<string | null>(null)
const [collapsed, setCollapsed] = useState({
  tasks: true,
  attention: true,
  activity: true,
})
const [taskModalOpen, setTaskModalOpen] = useState(false)
const [taskMode, setTaskMode] = useState<'create' | 'edit'>('create')
const [selectedTask, setSelectedTask] = useState<Task | null>(null)
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

    const accountId = membership.account_id
    const owner = membership.role === 'owner'
setIsOwner(owner)
setCurrentUserId(user.id)

    const leadQuery = supabase
      .from('leads')
      .select('*')
      .eq('account_id', accountId)

    const scopedLeadQuery = owner
  ? leadQuery
  : leadQuery.eq('assigned_user_id', user.id)

    const { data: leadData } = await scopedLeadQuery.order('created_at', {
      ascending: false,
    })

    setLeads(leadData || [])

    const { data: eventData } = await supabase
      .from('open_house_events')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true)

    setActiveEvents(eventData || [])

    const { data: propertyData } = await supabase
      .from('properties')
      .select('id, address')
      .eq('account_id', accountId)

    const propertyMap: Record<string, string> = {}
    propertyData?.forEach(p => {
      propertyMap[p.id] = p.address
    })

    setProperties(propertyMap)
    const taskQuery = supabase
  .from('tasks')
  .select('*')
  .eq('account_id', accountId)
  .order('due_date', { ascending: true })

const scopedTaskQuery = owner
  ? taskQuery
  : taskQuery.eq('assigned_user_id', user.id)

const { data: taskData } = await scopedTaskQuery
setTasks(taskData || [])
    
// RECENT ACTIVITY (last 10)
const { data: activityData } = await supabase
  .from('lead_activity')
  .select(`
    id,
    type,
    metadata,
    created_at,
    lead:leads (
      id,
      first_name,
      last_name
    ),
    user:profiles!lead_activity_user_id_fkey (
      full_name
    )
  `)
  .eq('account_id', accountId)
  .order('created_at', { ascending: false })
  .limit(10)

setActivities(activityData || [])
setLoading(false)
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

  const productionLeads = leads.filter(
  l => l.status === 'Closed' || l.status === 'Client'
)

const closedBuyers = productionLeads.filter(
  l => (l.deal_type || '').trim() === 'buyer'
).length

const closedSellers = productionLeads.filter(
  l => (l.deal_type || '').trim() === 'seller'
).length
const closedLeases = productionLeads.filter(
  l => (l.deal_type || '').trim() === 'lease'
).length

const totalClosed = closedBuyers + closedSellers + closedLeases
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

  const recentLeads = leads.slice(0, 5)

  const predefinedSources = [
    'Open House',
    'Social Media',
    'Referral',
    'Website',
    'Event / Raffle',
    'Other',
  ]

  const sourceCounts: Record<string, number> = {}
  leads.forEach(l => {
    const src = l.source || 'Other'
    sourceCounts[src] = (sourceCounts[src] || 0) + 1
  })
const pendingTasksCount = tasks.filter(t => t.status === 'pending').length
const newLeadsCount = leads.filter(l => l.status === 'New').length
const overdueTasksCount = tasks.filter(
  t => t.status === 'pending' && new Date(t.due_date) < new Date()
).length
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-md p-6">
      <div className="max-w-7xl mx-auto space-y-8">
       {/* COMMAND BAR — PERFORMANCE MODE */}
<div className="bg-gray-900 text-white rounded-xl px-8 py-5 flex gap-16 text-sm items-center shadow-md">
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
        {/* TASKS SECTION — EXECUTIVE MODE */}
<div
  className={`bg-white rounded-xl shadow-sm p-6 border-l-4 ${
    overdueTasksCount > 0
      ? 'border-red-500'
      : pendingTasksCount > 0
      ? 'border-amber-400'
      : 'border-green-500'
  }`}
>
  <div className="flex justify-between items-center mb-6">
    <button
      onClick={() =>
        setCollapsed(prev => ({ ...prev, tasks: !prev.tasks }))
      }
      className="text-lg font-semibold flex items-center gap-2"
    >
      Tasks
      <span className="text-sm text-gray-500 font-normal">
        ({pendingTasksCount})
      </span>
      <span
        className={`transition-transform ${
          collapsed.tasks ? 'rotate-0' : 'rotate-90'
        }`}
      >
        ▶
      </span>
    </button>

    <button
      onClick={() => {
        setTaskMode('create')
        setSelectedTask(null)
        setTaskModalOpen(true)
      }}
      className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-900 transition"
    >
      + New Task
    </button>
  </div>

  {!collapsed.tasks && (
    pendingTasksCount === 0 ? (
      <EmptyState text="You're clear for now." />
    ) : (
      <div className="divide-y divide-gray-100">
        {tasks
          .filter(t => t.status === 'pending')
          .map(task => {
            const due = new Date(task.due_date)
            const isOverdue = due < new Date()
            const formattedDate = due.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })

            const priorityColor =
              task.priority === 'high'
                ? 'bg-red-100 text-red-700'
                : task.priority === 'medium'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-600'

            return (
              <div
                key={task.id}
                className="py-4 flex justify-between items-center hover:bg-gray-50 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">
                      {task.title}
                    </span>

                    <span className={`text-xs px-2 py-1 rounded-full ${priorityColor}`}>
                      {task.priority}
                    </span>

                    {isOverdue && (
                      <span className="text-xs px-2 py-1 rounded-full bg-red-600 text-white">
                        OVERDUE
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-gray-500">
                    Due {formattedDate}
                  </div>
                </div>

                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => {
                      setTaskMode('edit')
                      setSelectedTask(task)
                      setTaskModalOpen(true)
                    }}
                    className="text-sm px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-100 transition"
                  >
                    Edit
                  </button>

                  <button
                    onClick={async () => {
  await supabase
    .from('tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', task.id)

  if (task.lead_id) {
    await supabase.from('lead_activity').insert({
      lead_id: task.lead_id,
      user_id: currentUserId,
      type: 'task_completed',
      metadata: {
        title: task.title,
      },
    })
  }

  loadDashboard()
}}
                    className="text-sm px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
                  >
                    Complete
                  </button>
                </div>
              </div>
            )
          })}
      </div>
    )
  )}
</div>

        {/* TOP ROW */}
<div className="grid md:grid-cols-2 gap-6">

  <SectionCard
  title="Recent Leads"
  className="border-l-4 border-gray-300"
>
  <LeadList leads={recentLeads} router={router} />
</SectionCard>

 {/* NEEDS ATTENTION — PERFORMANCE MODE */}
<SectionCard
  title={
    <button
      onClick={() =>
        setCollapsed(prev => ({ ...prev, attention: !prev.attention }))
      }
      className={`flex items-center justify-between w-full text-left ${
        attentionLeads.length > 0 ? 'text-red-600 font-semibold' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        Needs Attention ({attentionLeads.length})
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
    attentionLeads.length === 0 ? (
      <EmptyState text="No urgent leads." />
    ) : (
      <LeadList leads={attentionLeads} router={router} />
    )
  )}
</SectionCard>

</div>{/* RECENT ACTIVITY — EXECUTIVE LOG */}
<SectionCard
  title={
    <button
      onClick={() =>
        setCollapsed(prev => ({ ...prev, activity: !prev.activity }))
      }
      className="flex items-center justify-between w-full text-left"
    >
      <span className="uppercase tracking-wide text-xs text-gray-500">
        Recent Activity
      </span>

      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-900">
          {activities.length}
        </span>
        <span
          className={`transition-transform ${
            collapsed.activity ? 'rotate-0' : 'rotate-90'
          }`}
        >
          ▶
        </span>
      </div>
    </button>
  }
>
  {!collapsed.activity && (
    activities.length === 0 ? (
      <EmptyState text="No recent activity." />
    ) : (
      <div className="divide-y divide-gray-100">
        {activities.map((activity) => {
          const actor = activity.user?.[0]?.full_name || 'System'
          const leadName = `${activity.lead?.[0]?.first_name || ''} ${activity.lead?.[0]?.last_name || ''}`.trim()

          let actionText = ''
          if (activity.type === 'status_changed') {
            actionText = 'updated lead status'
          } else if (activity.type === 'reassigned') {
            actionText = 'reassigned lead'
          } else {
            actionText = activity.type.replace('_', ' ')
          }

          return (
            <div
              key={activity.id}
              className="flex justify-between items-center py-4 hover:bg-gray-50 transition"
            >
              <div className="text-sm text-gray-800">
                <span className="font-semibold text-gray-900">
                  {actor}
                </span>{' '}
                {actionText}{' '}
                {leadName && (
                  <span className="font-medium text-gray-900">
                    {leadName}
                  </span>
                )}
              </div>

              <div className="text-xs text-gray-400 whitespace-nowrap">
                {new Date(activity.created_at).toLocaleString()}
              </div>
            </div>
          )
        })}
      </div>
    )
  )}
</SectionCard>
{/* PRODUCTION — NEW */}
<SectionCard title="Production">
  <div className="grid md:grid-cols-4 gap-4 text-center">

    <div className="bg-gray-50 rounded-xl p-6">
      <div className="text-2xl font-bold">{closedBuyers}</div>
      <div className="text-sm text-gray-500">Buyers</div>
    </div>

    <div className="bg-gray-50 rounded-xl p-6">
      <div className="text-2xl font-bold">{closedSellers}</div>
      <div className="text-sm text-gray-500">Sellers</div>
    </div>

    <div className="bg-gray-50 rounded-xl p-6">
      <div className="text-2xl font-bold">{closedLeases}</div>
      <div className="text-sm text-gray-500">Leases</div>
    </div>

    <div className="bg-black text-white rounded-xl p-6">
      <div className="text-2xl font-bold">{totalClosed}</div>
      <div className="text-sm opacity-80">Total</div>
    </div>

  </div>
</SectionCard>
        {/* PIPELINE — EXECUTIVE MODE */}
<SectionCard title="Pipeline">
  <div className="grid md:grid-cols-6 gap-4 text-center">
    {['New','Contacted','Hot','Cold','Client','Closed','Lost'].map(status => {
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
          className="rounded-lg border border-gray-200 py-6 bg-white hover:shadow-sm transition"
        >
          <div className={`text-2xl font-semibold ${performanceColor}`}>
            {count}
          </div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mt-1">
            {status}
          </div>
        </div>
      )
    })}
  </div>
</SectionCard>

                {/* LEAD SOURCES — EXECUTIVE MODE */}
<SectionCard title="Lead Sources">
  <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
    {predefinedSources.map((src) => {
      const count = sourceCounts[src] || 0

      return (
        <div
          key={src}
          className={`border rounded-lg py-6 bg-white transition hover:shadow-sm ${
  count > 0 ? 'border-gray-300' : 'border-gray-100 opacity-60'
}`}
        >
          <div className="text-xl font-semibold text-gray-900">
            {count}
          </div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mt-1">
            {src}
          </div>
        </div>
      )
    })}
  </div>
</SectionCard>
{taskModalOpen && (
  <TaskModal
    mode={taskMode}
    task={selectedTask}
    onClose={() => setTaskModalOpen(false)}
    onSaved={loadDashboard}
    currentUserId={currentUserId}
    isOwner={isOwner}
    leadId={null}
  />
)}
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
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-150 p-6 ${className}`}>
      <div className="mb-4 border-b border-gray-100 pb-2">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-gray-500">
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}

function ProductionCard({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-6">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
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
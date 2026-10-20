'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TaskModal from '@/app/components/TaskModal'
import { MailWarning } from 'lucide-react'

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

export default function TasksPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskMode, setTaskMode] = useState<'create' | 'edit'>('create')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [newsletterTask, setNewsletterTask] = useState<string | null>(null)
  const [showAllCompleted, setShowAllCompleted] = useState(false)

  const loadTasks = async () => {
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

    // Smart task: an unapproved newsletter issue pins a task for the owner.
    // Driven purely by the live approval state — no task row is stored,
    // and any failure here must never break the page.
    if (owner) {
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
              setNewsletterTask(cur.month_name)
            } else if (!nxt.approved && torontoDay >= 18) {
              setNewsletterTask(nxt.month_name)
            }
          }
        }
      } catch {
        // Fail quiet: the page renders exactly as before.
      }
    }

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
    setLoading(false)
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const completeTask = async (task: Task) => {
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

    loadTasks()
  }

  const reopenTask = async (task: Task) => {
    await supabase
      .from('tasks')
      .update({
        status: 'pending',
        completed_at: null,
      })
      .eq('id', task.id)

    loadTasks()
  }

  const openCreate = function () {
    setTaskMode('create')
    setSelectedTask(null)
    setTaskModalOpen(true)
  }

  const closeModal = function () {
    setTaskModalOpen(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading tasks...
      </div>
    )
  }

  // Pending: due date ascending — overdue first, then today, then upcoming.
  const pendingTasks = tasks
    .filter(function (t) {
      return t.status === 'pending'
    })
    .slice()
    .sort(function (a, b) {
      return (a.due_date || '').localeCompare(b.due_date || '')
    })
  // Completed: most recently completed first; the list is capped at 5
  // until "Show all" expands it.
  const completedTasks = tasks
    .filter(function (t) {
      return t.status === 'completed'
    })
    .slice()
    .sort(function (a, b) {
      return (b.completed_at || '').localeCompare(a.completed_at || '')
    })
  const visibleCompletedTasks = showAllCompleted
    ? completedTasks
    : completedTasks.slice(0, 5)
  const toggleShowAllCompleted = function () {
    setShowAllCompleted(function (prev) {
      return !prev
    })
  }
  const pendingTasksCount = pendingTasks.length
  const tasksDisplayCount = pendingTasksCount + (newsletterTask ? 1 : 0)
  const overdueTasksCount = pendingTasks.filter(function (t) {
    return new Date(t.due_date) < new Date()
  }).length

  function renderPendingTask(task: Task) {
    const due = new Date(task.due_date)
    const isOverdue = due < new Date()
    const formattedDate = due.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    const priorityColor =
      task.priority === 'high'
        ? 'bg-red-100 text-red-700'
        : task.priority === 'medium'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-gray-100 text-gray-600'

    const onEdit = function () {
      setTaskMode('edit')
      setSelectedTask(task)
      setTaskModalOpen(true)
    }

    const onComplete = function () {
      completeTask(task)
    }

    return (
      <div
        key={task.id}
        className="py-4 flex justify-between items-center hover:bg-gray-50 transition"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-900">{task.title}</span>

            <span className={`text-xs px-2 py-1 rounded-full ${priorityColor}`}>
              {task.priority}
            </span>

            {isOverdue && (
              <span className="text-xs px-2 py-1 rounded-full bg-red-600 text-white">
                OVERDUE
              </span>
            )}
          </div>

          <div className="text-sm text-gray-500">Due {formattedDate}</div>
        </div>

        <div className="flex gap-2 items-center">
          <button
            onClick={onEdit}
            className="text-sm px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-100 transition"
          >
            Edit
          </button>

          <button
            onClick={onComplete}
            className="text-sm px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
          >
            Complete
          </button>
        </div>
      </div>
    )
  }

  function renderCompletedTask(task: Task) {
    const formattedCompleted = task.completed_at
      ? new Date(task.completed_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : ''

    const onReopen = function () {
      reopenTask(task)
    }

    return (
      <div
        key={task.id}
        className="py-4 flex justify-between items-center hover:bg-gray-50 transition"
      >
        <div className="space-y-1">
          <div className="font-medium text-gray-500 line-through">
            {task.title}
          </div>
          <div className="text-sm text-gray-400">
            Completed {formattedCompleted}
          </div>
        </div>

        <button
          onClick={onReopen}
          className="text-sm px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-100 transition"
        >
          Reopen
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-md p-6">
      <div className="max-w-7xl mx-auto space-y-8">
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
            <div className="text-lg font-semibold flex items-center gap-2">
              Tasks
              <span className="text-sm text-gray-500 font-normal">
                ({tasksDisplayCount})
              </span>
            </div>

            <button
              onClick={openCreate}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-900 transition"
            >
              + New Task
            </button>
          </div>

          {tasksDisplayCount === 0 ? (
            <div className="text-gray-500 text-sm py-4">
              {"You're clear for now."}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {newsletterTask && (
                <Link
                  href="/dashboard/campaigns/bb0b2174-639b-43fc-9f03-2bb289210de2"
                  className="py-4 flex justify-between items-center gap-4 hover:bg-amber-50 transition"
                >
                  <div className="flex items-start gap-3">
                    <MailWarning
                      size={20}
                      className="text-amber-500 mt-0.5 shrink-0"
                    />
                    <div className="space-y-1">
                      <div className="font-medium text-gray-900">
                        Approve the {newsletterTask} newsletter issue
                      </div>
                      <div className="text-sm text-gray-500">
                        Nothing sends until you approve it.
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-[#0f2a44] whitespace-nowrap">
                    Review &amp; approve {'→'}
                  </span>
                </Link>
              )}
              {pendingTasks.map(renderPendingTask)}
            </div>
          )}
        </div>

        {completedTasks.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <div className="text-lg font-semibold">
                Completed
                <span className="text-sm text-gray-500 font-normal">
                  {' '}
                  ({completedTasks.length})
                </span>
              </div>

              {completedTasks.length > 5 && (
                <button
                  onClick={toggleShowAllCompleted}
                  className="text-sm px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-100 transition"
                >
                  {showAllCompleted
                    ? 'Show less'
                    : 'Show all (' + completedTasks.length + ')'}
                </button>
              )}
            </div>

            <div className="divide-y divide-gray-100">
              {visibleCompletedTasks.map(renderCompletedTask)}
            </div>
          </div>
        )}

        {taskModalOpen && (
          <TaskModal
            mode={taskMode}
            task={selectedTask}
            onClose={closeModal}
            onSaved={loadTasks}
            currentUserId={currentUserId}
            isOwner={isOwner}
            leadId={null}
          />
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Phone, ArrowUpRight, CheckCircle2, Circle, Clock,
  Plus, X, User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { LeadFullPanel } from '@/components/leads/lead-full-panel'
import type { TeamMember } from '@/components/leads/detail/types'

// ── Types ─────────────────────────────────────────────────────────────────────
type Priority = 'high' | 'medium' | 'low'
type ActivityType = 'follow_up' | 'callback'

interface Lead {
  id: string
  first_name: string | null
  last_name:  string | null
  email:      string
  phone:      string | null
  company:    string | null
}

interface Activity {
  id:           string
  type:         ActivityType
  priority:     Priority
  title:        string
  notes:        string | null
  due_at:       string
  completed_at: string | null
  assigned_to:  string | null
  created_at:   string
  lead:         Lead | null
}

function leadName(lead: Lead | null) {
  if (!lead) return '—'
  const n = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  return n || lead.email
}

function fmtDate(iso: string) {
  const d   = new Date(iso)
  const now = new Date()
  // Compare calendar days so a 11pm follow-up still reads "Today" at 8am
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueMidnight   = new Date(d.getFullYear(),   d.getMonth(),   d.getDate())
  const days = Math.round((dueMidnight.getTime() - todayMidnight.getTime()) / 86400000)
  if (days < 0)   return { label: `${Math.abs(days)}d overdue`, overdue: true }
  if (days === 0) return { label: 'Today', overdue: false }
  if (days === 1) return { label: 'Tomorrow', overdue: false }
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false }
}

const selectCls = 'h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  initialActivities: Activity[]
  teamMembers:       { id: string; name: string }[]
  currentUserId:     string
  isAdmin?:          boolean
}

export function ActivitiesClient({ initialActivities, teamMembers, currentUserId, isAdmin }: Props) {
  const [activities,      setActivities]      = useState<Activity[]>(initialActivities)
  const [justCompleted,   setJustCompleted]   = useState<Set<string>>(new Set())
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [search,          setSearch]          = useState('')
  const [filterType,      setFilterType]      = useState('')
  const [filterAssigned,  setFilterAssigned]  = useState('')
  const [filterDone,      setFilterDone]      = useState('false')
  const [showNew,         setShowNew]         = useState(false)
  const [saving,          setSaving]          = useState(false)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivities(initialActivities)
  }, [initialActivities])

  // ── New form ──────────────────────────────────────────────────────────────
  const [newForm, setNewForm] = useState(() => ({
    leadId:     '',
    type:       'follow_up' as ActivityType,
    priority:   'medium'   as Priority,
    title:      '',
    notes:      '',
    dueAt:      new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    assignedTo: currentUserId,
  }))

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return activities.filter((a) => {
      if (filterType     && a.type        !== filterType)     return false
      if (filterAssigned && a.assigned_to !== filterAssigned) return false
      // For filterDone: if item is justCompleted, keep it visible briefly
      if (filterDone === 'true'  && !a.completed_at && !justCompleted.has(a.id)) return false
      if (filterDone === 'false' &&  a.completed_at && !justCompleted.has(a.id)) return false
      if (q) {
        const hay = [a.title, leadName(a.lead), a.lead?.company, a.lead?.email, a.lead?.phone]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [activities, search, filterType, filterAssigned, filterDone, justCompleted])

  // ── Toggle done (with brief visual linger) ────────────────────────────────
  async function toggleDone(activity: Activity) {
    const nowDone = !activity.completed_at
    const updatedAt = nowDone ? new Date().toISOString() : null

    setActivities((prev) => prev.map((a) =>
      a.id === activity.id ? { ...a, completed_at: updatedAt } : a
    ))
    if (selectedActivity?.id === activity.id) {
      setSelectedActivity((s) => s ? { ...s, completed_at: updatedAt } : s)
    }

    if (nowDone) {
      setJustCompleted((s) => new Set([...s, activity.id]))
      const t = setTimeout(() => {
        setJustCompleted((s) => { const n = new Set(s); n.delete(activity.id); return n })
        setSelectedActivity((s) => s?.id === activity.id ? null : s)
      }, 1200)
      timers.current.set(activity.id, t)
    } else {
      const t = timers.current.get(activity.id)
      if (t) { clearTimeout(t); timers.current.delete(activity.id) }
      setJustCompleted((s) => { const n = new Set(s); n.delete(activity.id); return n })
    }

    await fetch(`/api/activities/${activity.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ completed: nowDone }),
    })
  }

  async function deleteActivity(id: string) {
    setActivities((prev) => prev.filter((a) => a.id !== id))
    await fetch(`/api/activities/${id}`, { method: 'DELETE' })
  }

  async function handleCreate() {
    if (!newForm.title.trim() || !newForm.leadId) return
    setSaving(true)
    try {
      const res = await fetch('/api/activities', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          leadId:     newForm.leadId,
          type:       newForm.type,
          priority:   newForm.priority,
          title:      newForm.title,
          notes:      newForm.notes || undefined,
          dueAt:      new Date(newForm.dueAt).toISOString(),
          assignedTo: newForm.assignedTo || null,
        }),
      })
      if (res.ok) {
        const listRes = await fetch('/api/activities?done=false')
        const json = await listRes.json() as { data?: { activities: Activity[] } }
        if (json.data?.activities) setActivities(json.data.activities)
        setShowNew(false)
        setNewForm({ leadId: '', type: 'follow_up', priority: 'medium', title: '', notes: '',
          dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16), assignedTo: currentUserId })
      }
    } finally { setSaving(false) }
  }

  const openCount    = activities.filter((a) => !a.completed_at).length
  const overdueCount = activities.filter((a) => !a.completed_at && new Date(a.due_at) < new Date()).length

  const panelTeamMembers = (teamMembers as TeamMember[])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {openCount} open{overdueCount > 0 && <span className="text-red-500 font-medium"> · {overdueCount} overdue</span>}
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Activity
        </Button>
      </div>

      <>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-48 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={selectCls}>
          <option value="">All types</option>
          <option value="follow_up">Follow-up</option>
          <option value="callback">Callback</option>
        </select>

        {isAdmin && (
          <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)} className={selectCls}>
            <option value="">All reps</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}

        <select value={filterDone} onChange={(e) => setFilterDone(e.target.value)} className={selectCls}>
          <option value="false">Open</option>
          <option value="true">Past / Completed</option>
          <option value="">All</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-10 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Task</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Contact</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Company</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Phone</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Due</th>
              {isAdmin && <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Rep</th>}
              <th className="w-8 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-muted-foreground text-sm">
                  {activities.length === 0 ? 'No activities yet.' : 'No activities match the current filters.'}
                </td>
              </tr>
            )}
            {filtered.map((a) => {
              const due   = fmtDate(a.due_at)
              const done  = !!a.completed_at
              const linger = justCompleted.has(a.id)
              const assignee = teamMembers.find((m) => m.id === a.assigned_to)

              return (
                <tr
                  key={a.id}
                  onClick={() => setSelectedActivity(a)}
                  className={cn(
                    'group transition-all cursor-pointer',
                    done && !linger ? 'opacity-40' : 'hover:bg-muted/30',
                    linger && 'bg-emerald-50/50 dark:bg-emerald-950/20',
                    selectedActivity?.id === a.id && 'bg-primary/5'
                  )}
                >
                  {/* Complete toggle */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleDone(a)}
                      className={cn(
                        'transition-all',
                        done ? 'text-emerald-500' : 'text-muted-foreground hover:text-primary'
                      )}
                      title={done ? 'Mark open' : 'Mark done'}
                    >
                      {done
                        ? <CheckCircle2 className={cn('h-4 w-4', linger && 'scale-110')} />
                        : <Circle className="h-4 w-4" />
                      }
                    </button>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                      a.type === 'callback' ? 'bg-blue-500/10 text-blue-600' : 'bg-violet-500/10 text-violet-600'
                    )}>
                      {a.type === 'callback' ? <Phone className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {a.type === 'callback' ? 'Call Back' : 'Follow-up'}
                    </span>
                  </td>

                  {/* Task */}
                  <td className="px-3 py-3 max-w-[180px]">
                    <p className={cn('truncate font-medium text-sm', done && 'line-through text-muted-foreground')}>
                      {a.title}
                    </p>
                    {a.notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.notes}</p>
                    )}
                  </td>

                  {/* Contact */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {a.lead ? (
                      <Link href={`/leads/${a.lead.id}`} className="font-medium hover:text-primary hover:underline underline-offset-2 text-sm">
                        {leadName(a.lead)}
                      </Link>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>

                  {/* Company */}
                  <td className="px-3 py-3 text-sm text-muted-foreground">{a.lead?.company ?? '—'}</td>

                  {/* Phone */}
                  <td className="px-3 py-3 text-xs text-muted-foreground font-mono">{a.lead?.phone ?? '—'}</td>

                  {/* Due */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={cn('flex items-center gap-1 text-xs font-medium', due.overdue ? 'text-red-500' : 'text-muted-foreground')}>
                      <Clock className="h-3 w-3 shrink-0" />
                      {due.label}
                    </span>
                  </td>

                  {/* Rep (admin only) */}
                  {isAdmin && (
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        {assignee?.name ?? '—'}
                      </span>
                    </td>
                  )}

                  {/* Delete */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => deleteActivity(a.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      title="Delete"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Lead full panel — opened when clicking an activity row */}
      {selectedActivity?.lead && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelectedActivity(null)} />
          <LeadFullPanel
            leadId={selectedActivity.lead.id}
            teamMembers={panelTeamMembers}
            isAdmin={isAdmin ?? false}
            currentUserId={currentUserId}
            canEditBatch={isAdmin ?? false}
            onClose={() => setSelectedActivity(null)}
            onLeadChange={() => {}}
            activityDone={!!selectedActivity.completed_at}
            onMarkActivityDone={() => toggleDone(selectedActivity)}
          />
        </>
      )}

      {/* New Activity Dialog */}
      <Dialog open={showNew} onClose={() => setShowNew(false)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>New Activity</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select value={newForm.type} onChange={(e) => setNewForm((f) => ({ ...f, type: e.target.value as ActivityType }))} className={cn(selectCls, 'w-full')}>
                  <option value="follow_up">Follow-up</option>
                  <option value="callback">Call Back</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <select value={newForm.priority} onChange={(e) => setNewForm((f) => ({ ...f, priority: e.target.value as Priority }))} className={cn(selectCls, 'w-full')}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Call back about proposal" value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Lead ID <span className="text-destructive">*</span></Label>
                <Input placeholder="Paste lead ID from the URL" value={newForm.leadId} onChange={(e) => setNewForm((f) => ({ ...f, leadId: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Open a lead and copy the ID from the URL bar.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date <span className="text-destructive">*</span></Label>
                <Input type="datetime-local" value={newForm.dueAt} onChange={(e) => setNewForm((f) => ({ ...f, dueAt: e.target.value }))} />
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Assign to</Label>
                  <select value={newForm.assignedTo} onChange={(e) => setNewForm((f) => ({ ...f, assignedTo: e.target.value }))} className={cn(selectCls, 'w-full')}>
                    {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              <div className={cn('space-y-1.5', isAdmin ? '' : 'col-span-2')}>
                <Label>Notes</Label>
                <textarea
                  placeholder="Optional notes…"
                  value={newForm.notes}
                  onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newForm.title.trim() || !newForm.leadId || saving} loading={saving}>
              Create Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </>
    </div>
  )
}

'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Phone, ArrowUpRight, CheckCircle2, Circle, Clock,
  AlertCircle, Minus, ChevronDown, Plus, Filter, X,
  CalendarDays, User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

// ── Types ────────────────────────────────────────────────────────────────────
type Priority = 'high' | 'medium' | 'low'
type ActivityType = 'follow_up' | 'callback'

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  company: string | null
}

interface Activity {
  id: string
  type: ActivityType
  priority: Priority
  title: string
  notes: string | null
  due_at: string
  completed_at: string | null
  assigned_to: string | null
  created_at: string
  lead: Lead | null
}

// ── Priority config ───────────────────────────────────────────────────────────
const PRIORITY: Record<Priority, { label: string; color: string; dot: string; icon: React.FC<{className?:string}> }> = {
  high:   { label: 'High',   color: 'text-red-500',    dot: 'bg-red-500',    icon: AlertCircle },
  medium: { label: 'Medium', color: 'text-amber-500',  dot: 'bg-amber-500',  icon: Minus },
  low:    { label: 'Low',    color: 'text-slate-400',  dot: 'bg-slate-400',  icon: ChevronDown },
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function leadName(lead: Lead | null) {
  if (!lead) return '—'
  const n = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  return n || lead.email
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / 86400000)
  if (diffDays < 0)  return { label: `${Math.abs(diffDays)}d overdue`, overdue: true }
  if (diffDays === 0) return { label: 'Today', overdue: false }
  if (diffDays === 1) return { label: 'Tomorrow', overdue: false }
  return {
    label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    overdue: false,
  }
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  initialActivities: Activity[]
  teamMembers: { id: string; name: string }[]
  currentUserId: string
}

export function ActivitiesClient({ initialActivities, teamMembers, currentUserId }: Props) {
  const router = useRouter()
  const [activities, setActivities] = useState<Activity[]>(initialActivities)

  // Sync when server re-renders (after router.refresh())
  useEffect(() => {
    setActivities(initialActivities)
  }, [initialActivities])

  // Always fetch fresh on mount
  useEffect(() => {
    router.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [search, setSearch]         = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [filterAssigned, setFilterAssigned] = useState<string>('')
  const [filterDone, setFilterDone] = useState<string>('false')
  const [showNew, setShowNew]       = useState(false)
  const [saving, setSaving]         = useState(false)

  // ── New-activity form ────────────────────────────────────────────────────
  const [newForm, setNewForm] = useState({
    leadId:     '',
    type:       'follow_up' as ActivityType,
    priority:   'medium' as Priority,
    title:      '',
    notes:      '',
    dueAt:      new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    assignedTo: currentUserId,
  })

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return activities.filter((a) => {
      if (filterType     && a.type     !== filterType)     return false
      if (filterPriority && a.priority !== filterPriority) return false
      if (filterAssigned && a.assigned_to !== filterAssigned) return false
      if (filterDone === 'true'  && !a.completed_at) return false
      if (filterDone === 'false' &&  a.completed_at) return false
      if (q) {
        const hay = [
          a.title,
          leadName(a.lead),
          a.lead?.company,
          a.lead?.email,
          a.lead?.phone,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [activities, search, filterType, filterPriority, filterAssigned, filterDone])

  // ── Toggle done ───────────────────────────────────────────────────────────
  async function toggleDone(activity: Activity) {
    const completed = !activity.completed_at
    setActivities((prev) => prev.map((a) =>
      a.id === activity.id
        ? { ...a, completed_at: completed ? new Date().toISOString() : null }
        : a
    ))
    await fetch(`/api/activities/${activity.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    })
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function deleteActivity(id: string) {
    setActivities((prev) => prev.filter((a) => a.id !== id))
    await fetch(`/api/activities/${id}`, { method: 'DELETE' })
  }

  // ── Create ────────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!newForm.title.trim() || !newForm.leadId) return
    setSaving(true)
    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        // Refresh list
        const listRes = await fetch('/api/activities?done=false')
        const json = await listRes.json() as { data?: { activities: Activity[] } }
        if (json.data?.activities) setActivities(json.data.activities)
        setShowNew(false)
        setNewForm({ leadId: '', type: 'follow_up', priority: 'medium', title: '', notes: '',
          dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
          assignedTo: currentUserId })
      }
    } finally {
      setSaving(false)
    }
  }

  const openCount  = activities.filter((a) => !a.completed_at).length
  const overdueCount = activities.filter((a) => !a.completed_at && new Date(a.due_at) < new Date()).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {openCount} open · {overdueCount > 0 && (
              <span className="text-red-500 font-medium">{overdueCount} overdue · </span>
            )}
            follow-ups &amp; callbacks
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Activity
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Input
            placeholder="Search activities…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-52 pl-3 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-8 w-36 text-sm">
          <option value="">All types</option>
          <option value="follow_up">Follow-up</option>
          <option value="callback">Callback</option>
        </Select>

        <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="h-8 w-36 text-sm">
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>

        <Select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)} className="h-8 w-40 text-sm">
          <option value="">All assignees</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>

        <Select value={filterDone} onChange={(e) => setFilterDone(e.target.value)} className="h-8 w-32 text-sm">
          <option value="false">Open</option>
          <option value="true">Completed</option>
          <option value="">All</option>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-8 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Priority</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Title</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Company</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Contact</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Phone</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Due Date</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Assigned</th>
              <th className="w-8 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="py-16 text-center text-muted-foreground text-sm">
                  {activities.length === 0
                    ? 'No activities yet. Create one to get started.'
                    : 'No activities match the current filters.'}
                </td>
              </tr>
            )}
            {filtered.map((a) => {
              const p = PRIORITY[a.priority]
              const PIcon = p.icon
              const due = fmtDate(a.due_at)
              const done = !!a.completed_at
              const assignee = teamMembers.find((m) => m.id === a.assigned_to)

              return (
                <tr key={a.id} className={cn('group transition-colors hover:bg-muted/30', done && 'opacity-50')}>
                  {/* Done checkbox */}
                  <td className="px-3 py-3">
                    <button
                      onClick={() => toggleDone(a)}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title={done ? 'Mark open' : 'Mark done'}
                    >
                      {done
                        ? <CheckCircle2 className="h-4 w-4 text-primary" />
                        : <Circle className="h-4 w-4" />
                      }
                    </button>
                  </td>

                  {/* Priority */}
                  <td className="px-3 py-3">
                    <span className={cn('flex items-center gap-1.5 text-xs font-medium', p.color)}>
                      <PIcon className="h-3.5 w-3.5" />
                      {p.label}
                    </span>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                      a.type === 'callback'
                        ? 'bg-blue-500/10 text-blue-500'
                        : 'bg-violet-500/10 text-violet-500'
                    )}>
                      {a.type === 'callback' ? <Phone className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {a.type === 'callback' ? 'Callback' : 'Follow-up'}
                    </span>
                  </td>

                  {/* Title */}
                  <td className="px-3 py-3 max-w-[200px]">
                    <p className={cn('truncate font-medium', done && 'line-through text-muted-foreground')}>
                      {a.title}
                    </p>
                    {a.notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.notes}</p>
                    )}
                  </td>

                  {/* Company */}
                  <td className="px-3 py-3 text-muted-foreground">
                    {a.lead?.company ?? '—'}
                  </td>

                  {/* Contact */}
                  <td className="px-3 py-3">
                    {a.lead ? (
                      <Link
                        href={`/leads/${a.lead.id}`}
                        className="font-medium hover:text-primary hover:underline underline-offset-2"
                      >
                        {leadName(a.lead)}
                      </Link>
                    ) : '—'}
                  </td>

                  {/* Phone */}
                  <td className="px-3 py-3 text-muted-foreground font-mono text-xs">
                    {a.lead?.phone ?? '—'}
                  </td>

                  {/* Email */}
                  <td className="px-3 py-3 text-muted-foreground text-xs truncate max-w-[160px]">
                    {a.lead?.email ?? '—'}
                  </td>

                  {/* Due date */}
                  <td className="px-3 py-3">
                    <span className={cn(
                      'flex items-center gap-1 text-xs font-medium',
                      due.overdue ? 'text-red-500' : 'text-muted-foreground'
                    )}>
                      <Clock className="h-3 w-3 shrink-0" />
                      {due.label}
                    </span>
                  </td>

                  {/* Assigned */}
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3 shrink-0" />
                      {assignee?.name ?? '—'}
                    </span>
                  </td>

                  {/* Delete */}
                  <td className="px-3 py-3">
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
                <Select value={newForm.type} onChange={(e) => setNewForm((f) => ({ ...f, type: e.target.value as ActivityType }))}>
                  <option value="follow_up">Follow-up</option>
                  <option value="callback">Callback</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={newForm.priority} onChange={(e) => setNewForm((f) => ({ ...f, priority: e.target.value as Priority }))}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Follow up on proposal"
                  value={newForm.title}
                  onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Lead ID <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Lead UUID (from lead detail page URL)"
                  value={newForm.leadId}
                  onChange={(e) => setNewForm((f) => ({ ...f, leadId: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Open a lead, copy the ID from the URL, paste here.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date <span className="text-destructive">*</span></Label>
                <Input
                  type="datetime-local"
                  value={newForm.dueAt}
                  onChange={(e) => setNewForm((f) => ({ ...f, dueAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Assign to</Label>
                <Select value={newForm.assignedTo} onChange={(e) => setNewForm((f) => ({ ...f, assignedTo: e.target.value }))}>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
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
            <Button
              onClick={handleCreate}
              disabled={!newForm.title.trim() || !newForm.leadId || saving}
              loading={saving}
            >
              Create Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

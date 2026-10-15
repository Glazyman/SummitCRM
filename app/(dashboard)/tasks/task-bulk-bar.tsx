'use client'

import * as React from 'react'
import {
  X, ChevronDown, Trash2, UserRound, CheckCircle2, Circle,
  CalendarClock, Flag, Phone, ArrowUpRight, RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'

export type RescheduleTarget = 'today' | 'tomorrow' | 'next_monday' | 'plus_week'
export type BulkTaskPatch =
  | { completed: boolean }
  | { priority: 'high' | 'medium' | 'low' }
  | { type: 'follow_up' | 'callback' }
  | { assignedTo: string }

interface Props {
  selectedCount: number
  teamMembers:   { id: string; name: string }[]
  isAdmin:       boolean
  busy:          boolean
  onClear:       () => void
  onPatch:       (patch: BulkTaskPatch) => void
  onReschedule:  (target: RescheduleTarget) => void
  onDelete:      () => void
  /** Leads behind the selected tasks — "Reset to New" acts on these. */
  leadCount:     number
  onResetLeads:  () => void
}

/**
 * Floating bar shown while tasks are selected. Mirrors the Leads
 * BulkActionBar, but wraps onto two rows at phone width.
 */
export function TaskBulkBar({
  selectedCount, teamMembers, isAdmin, busy,
  onClear, onPatch, onReschedule, onDelete, leadCount, onResetLeads,
}: Props) {
  const [deleteConfirm, setDeleteConfirm] = React.useState(false)
  const [resetConfirm,  setResetConfirm]  = React.useState(false)

  if (selectedCount === 0) return null

  const trigger = (icon: React.ReactNode, label: string) => (
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy}>
        {icon}{label}<ChevronDown className="h-3 w-3 opacity-60" />
      </Button>
    </DropdownMenuTrigger>
  )

  return (
    <div className="fixed inset-x-4 bottom-4 z-40 flex justify-center lg:bottom-6">
      <div className={cn(
        'flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-border',
        'bg-background/95 backdrop-blur-md px-3 py-2.5 shadow-2xl',
        'animate-in slide-in-from-bottom-4 fade-in duration-200',
      )}>
        {/* Selection count */}
        <div className="flex items-center gap-2 pr-1 sm:pr-3 sm:border-r sm:border-border">
          <div className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground tabular-nums">
            {selectedCount}
          </div>
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedCount === 1 ? 'task' : 'tasks'} selected
          </span>
          <button
            type="button"
            onClick={onClear}
            className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Button
            variant="outline" size="sm" disabled={busy}
            className="h-8 gap-1.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            onClick={() => onPatch({ completed: true })}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Done
          </Button>
          <Button
            variant="outline" size="sm" disabled={busy}
            className="h-8 gap-1.5 text-xs"
            onClick={() => onPatch({ completed: false })}
          >
            <Circle className="h-3.5 w-3.5" /> Open
          </Button>

          <DropdownMenu>
            {trigger(<CalendarClock className="h-3.5 w-3.5" />, 'Reschedule')}
            <DropdownMenuContent align="start" side="top" minWidth="170px">
              <DropdownMenuLabel>Move due date to</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onReschedule('today')}>Today</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReschedule('tomorrow')}>Tomorrow</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReschedule('next_monday')}>Next Monday</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReschedule('plus_week')}>Push 1 week</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            {trigger(<Flag className="h-3.5 w-3.5" />, 'Priority')}
            <DropdownMenuContent align="start" side="top" minWidth="140px">
              <DropdownMenuLabel>Set priority</DropdownMenuLabel>
              {([
                ['high',   'High',   'bg-red-500'],
                ['medium', 'Medium', 'bg-amber-500'],
                ['low',    'Low',    'bg-emerald-500'],
              ] as const).map(([value, label, dot]) => (
                <DropdownMenuItem key={value} onClick={() => onPatch({ priority: value })}>
                  <span className={cn('h-2 w-2 rounded-full', dot)} />{label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            {trigger(<ArrowUpRight className="h-3.5 w-3.5" />, 'Type')}
            <DropdownMenuContent align="start" side="top" minWidth="140px">
              <DropdownMenuLabel>Change type to</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onPatch({ type: 'follow_up' })}>
                <ArrowUpRight className="h-3.5 w-3.5 text-violet-600" /> Follow-up
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPatch({ type: 'callback' })}>
                <Phone className="h-3.5 w-3.5 text-blue-600" /> Call Back
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {isAdmin && teamMembers.length > 0 && (
            <DropdownMenu>
              {trigger(<UserRound className="h-3.5 w-3.5" />, 'Assign')}
              <DropdownMenuContent align="end" side="top" minWidth="170px">
                <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                {teamMembers.map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => onPatch({ assignedTo: m.id })}>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                      {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    {m.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Reset to New — admin only (the leads bulk API is admin-gated).
              Resets the LEADS behind the selected tasks: status → new, their
              call logs + open tasks erased. Own confirm that says so. */}
          {isAdmin && leadCount > 0 && (
            !resetConfirm ? (
              <Button
                variant="outline" size="sm" disabled={busy}
                className="h-8 gap-1.5 text-xs"
                onClick={() => { setResetConfirm(true); setDeleteConfirm(false) }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset to New
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 dark:border-amber-800 dark:bg-amber-950/30">
                <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  Reset {leadCount} {leadCount === 1 ? 'lead' : 'leads'}? Erases their calls + open tasks
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-amber-800 underline hover:text-amber-900 dark:text-amber-300"
                  onClick={() => { onResetLeads(); setResetConfirm(false) }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setResetConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            )
          )}

          {!deleteConfirm ? (
            <Button
              variant="outline" size="sm" disabled={busy}
              className="h-8 gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => { setDeleteConfirm(true); setResetConfirm(false) }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1">
              <span className="text-xs text-destructive font-medium">Delete {selectedCount}?</span>
              <button
                type="button"
                className="text-xs text-destructive hover:text-destructive/80 font-semibold underline"
                onClick={() => { onDelete(); setDeleteConfirm(false) }}
              >
                Confirm
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

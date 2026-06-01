'use client'

import * as React from 'react'
import { X, ChevronDown, Trash2, UserRound, Tag, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { STATUS_CONFIG, ALL_STATUSES } from './status-config'
import type { LeadRow } from './types'

interface BatchOption  { id: string; name: string }
interface MemberOption { id: string; name: string }

interface BulkActionBarProps {
  selectedCount: number
  batches:       BatchOption[]
  teamMembers:   MemberOption[]
  isAdmin:       boolean
  onClearSelection: () => void
  onBulkStatus:  (status: LeadRow['status']) => void
  onBulkAssign:  (userId: string) => void
  onBulkBatch:   (batchId: string) => void
  onBulkDelete:  () => void
}

/**
 * Sticky bar that slides in from the bottom when rows are selected.
 * Provides bulk: status change, assign, add to batch, delete.
 */
export function BulkActionBar({
  selectedCount,
  batches,
  teamMembers,
  isAdmin,
  onClearSelection,
  onBulkStatus,
  onBulkAssign,
  onBulkBatch,
  onBulkDelete,
}: BulkActionBarProps) {
  const [deleteConfirm, setDeleteConfirm] = React.useState(false)

  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className={cn(
        'flex items-center gap-2 rounded-2xl border border-border',
        'bg-background/95 backdrop-blur-md px-4 py-2.5 shadow-2xl',
        'animate-in slide-in-from-bottom-4 fade-in duration-200'
      )}>
        {/* Selection count */}
        <div className="flex items-center gap-2 pr-3 border-r border-border">
          <div className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground tabular-nums">
            {selectedCount.toLocaleString()}
          </div>
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedCount === 1 ? 'lead' : 'leads'} selected
          </span>
          <button
            type="button"
            onClick={onClearSelection}
            className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">

          {/* Change Status */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Status
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" minWidth="160px">
              <DropdownMenuLabel>Change status to</DropdownMenuLabel>
              {ALL_STATUSES.map((status) => {
                const meta = STATUS_CONFIG[status]
                return (
                  <DropdownMenuItem key={status} onClick={() => onBulkStatus(status)}>
                    <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                    {meta.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign to rep (admin only) */}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <UserRound className="h-3.5 w-3.5" />
                  Assign
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" minWidth="160px">
                <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onBulkAssign('')}>
                  Unassigned
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {teamMembers.map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => onBulkAssign(m.id)}>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                      {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    {m.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Add to batch — admin only (reps can't move leads between batches) */}
          {isAdmin && batches.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <Tag className="h-3.5 w-3.5" />
                  Batch
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" minWidth="180px">
                <DropdownMenuLabel>Add to batch</DropdownMenuLabel>
                {batches.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => onBulkBatch(b.id)}>
                    {b.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Delete — manager+ only */}
          {isAdmin && (
            <>
              {!deleteConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              ) : (
                <div className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1">
                  <span className="text-xs text-destructive font-medium">Delete {selectedCount}?</span>
                  <button
                    type="button"
                    className="text-xs text-destructive hover:text-destructive/80 font-semibold underline"
                    onClick={() => { onBulkDelete(); setDeleteConfirm(false) }}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

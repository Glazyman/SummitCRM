'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, MoreHorizontal,
  Trash2, BellOff, UserRound, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { STATUS_CONFIG } from '@/components/leads/status-config'
import { StatusSelect, InterestSelect } from '@/components/leads/status-select'
import type { LeadDetail, TeamMember, LeadStatus } from './types'
import type { InterestStatus } from '@/types/database'

interface LeadActionBarProps {
  lead:         LeadDetail
  teamMembers:  TeamMember[]
  isAdmin:      boolean
  onStatusChange:   (s: LeadStatus) => void
  onInterestChange?: (s: InterestStatus) => void
  onAssign:         (userId: string) => void
  onDelete:         () => void
  onDoNotContact:   () => void
}

export function LeadActionBar({
  lead,
  teamMembers,
  isAdmin,
  onStatusChange,
  onInterestChange,
  onAssign,
  onDelete,
  onDoNotContact,
}: LeadActionBarProps) {
  const router       = useRouter()
  const name         = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
  const meta         = STATUS_CONFIG[lead.status]

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">

        {/* ← Back + breadcrumb */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              // router.refresh() busts the router cache so the leads page
              // re-runs its server component and shows updated data.
              router.refresh()
              router.back()
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Back to leads"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold sm:text-base">{name}</h1>
            {lead.company && (
              <p className="truncate text-xs text-muted-foreground">{lead.company}</p>
            )}
          </div>

          {/* Status badge */}
          <div className={cn(
            'hidden sm:inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
            meta.badge
          )}>
            {meta.label}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
          {/* Status — reui-style select (current value + colored dot) */}
          <div className="w-36 sm:w-40">
            <StatusSelect value={lead.status} onChange={onStatusChange} />
          </div>

          {/* Interest — reui-style select */}
          {onInterestChange && (
            <div className="w-32 sm:w-36">
              <InterestSelect value={(lead.interest_status ?? 'pending') as InterestStatus} onChange={onInterestChange} />
            </div>
          )}

          {/* Assign — admin only */}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                  <UserRound className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Assign</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" minWidth="170px">
                <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onAssign('')}>
                  Unassigned
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {teamMembers.map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => onAssign(m.id)}>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary shrink-0">
                      {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    {m.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* More actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" minWidth="190px">
              <DropdownMenuItem
                onClick={onDoNotContact}
                icon={<BellOff className="h-3.5 w-3.5" />}
              >
                Mark Bad Lead
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isAdmin && (
                <DropdownMenuItem
                  destructive
                  onClick={onDelete}
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  Delete Lead
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Unsubscribe warning banner */}
      {lead.is_unsubscribed && (
        <div className="flex items-center gap-2 bg-secondary px-4 py-2 text-xs text-foreground sm:px-6">
          <BellOff className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Unsubscribed</strong> — this lead has opted out. Do not send marketing emails.
          </span>
        </div>
      )}

      {/* Bad Lead banner */}
      {lead.status === 'do_not_contact' && !lead.is_unsubscribed && (
        <div className="flex items-center gap-2 bg-secondary px-4 py-2 text-xs text-foreground sm:px-6">
          <BellOff className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Bad Lead</strong> — all outreach to this lead is blocked.
          </span>
        </div>
      )}
    </div>
  )
}

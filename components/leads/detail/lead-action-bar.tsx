'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Mail, Sparkles, MoreHorizontal,
  Trash2, BellOff, UserRound, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { STATUS_CONFIG, ALL_STATUSES } from '@/components/leads/status-config'
import type { LeadDetail, TeamMember, LeadStatus } from './types'

interface LeadActionBarProps {
  lead:         LeadDetail
  teamMembers:  TeamMember[]
  isAdmin:      boolean
  onStatusChange: (s: LeadStatus) => void
  onAssign:       (userId: string) => void
  onSendEmail:    () => void
  onAIDraft:      () => void
  onDelete:       () => void
  onDoNotContact: () => void
}

export function LeadActionBar({
  lead,
  teamMembers,
  isAdmin,
  onStatusChange,
  onAssign,
  onSendEmail,
  onAIDraft,
  onDelete,
  onDoNotContact,
}: LeadActionBarProps) {
  const name    = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
  const meta    = STATUS_CONFIG[lead.status]

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">

        {/* ← Back + breadcrumb */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href="/leads"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Back to leads"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

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
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Send Email */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={onSendEmail}
            disabled={lead.is_unsubscribed || lead.status === 'do_not_contact'}
          >
            <Mail className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Send Email</span>
          </Button>

          {/* AI Draft */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs border-border text-foreground hover:bg-secondary"
            onClick={onAIDraft}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">AI Draft</span>
          </Button>

          {/* Change Status */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                Status <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" minWidth="170px">
              <DropdownMenuLabel>Change status</DropdownMenuLabel>
              {ALL_STATUSES.map((s) => {
                const m = STATUS_CONFIG[s]
                return (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => onStatusChange(s)}
                    className={cn(s === lead.status && 'opacity-50 cursor-default')}
                  >
                    <span className={cn('h-2 w-2 rounded-full', m.dot)} />
                    {m.label}
                    {s === lead.status && (
                      <span className="ml-auto text-xs text-muted-foreground">current</span>
                    )}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

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
                    {m.id === lead.assigned_to && (
                      <span className="ml-auto text-xs text-muted-foreground">current</span>
                    )}
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
                Mark Do Not Contact
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

      {/* Do Not Contact banner */}
      {lead.status === 'do_not_contact' && !lead.is_unsubscribed && (
        <div className="flex items-center gap-2 bg-secondary px-4 py-2 text-xs text-foreground sm:px-6">
          <BellOff className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Do Not Contact</strong> — all outreach to this lead is blocked.
          </span>
        </div>
      )}
    </div>
  )
}

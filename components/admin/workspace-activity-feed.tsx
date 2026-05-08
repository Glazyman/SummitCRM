'use client'

/**
 * components/admin/workspace-activity-feed.tsx
 *
 * Recent workspace-level activity feed with type filter.
 * Shows user avatar, action description, and relative timestamp.
 */

import React, { useState, useMemo } from 'react'
import { Badge }   from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Activity, Mail, TrendingUp, MessageSquare, AlertCircle,
  UserPlus, FileText, Bell, Zap, Megaphone, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActivityEvent } from './types'

// ── Event config ─────────────────────────────────────────────────────────
interface EventConfig {
  icon:    React.ReactNode
  color:   string
  label:   (e: ActivityEvent) => string
}

const EVENT_CONFIGS: Record<string, EventConfig> = {
  email_sent:          { icon: <Mail         className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',       label: (e) => `Sent email: "${String(e.metadata.subject ?? '')?.slice(0, 50)}"` },
  email_opened:        { icon: <TrendingUp   className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',     label: (e) => `Email opened: "${String(e.metadata.subject ?? '')?.slice(0, 40)}"` },
  email_replied:       { icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground', label: (e) => `Got a reply: "${String(e.metadata.subject ?? '')?.slice(0, 40)}"` },
  email_bounced:       { icon: <AlertCircle  className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',             label: (e) => `Email bounced${e.metadata.reason ? `: ${e.metadata.reason}` : ''}` },
  lead_created:        { icon: <UserPlus     className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',  label: (e) => `Added ${e.metadata.count ? `${e.metadata.count} leads` : 'a lead'}${e.metadata.source ? ` via ${e.metadata.source}` : ''}` },
  lead_status_changed: { icon: <Activity     className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',  label: (e) => `Updated lead status: ${e.metadata.from} → ${e.metadata.to}` },
  note_added:          { icon: <FileText     className="h-3.5 w-3.5" />, color: 'bg-gray-100 text-gray-600',             label: () => 'Added a note to a lead' },
  follow_up_created:   { icon: <Bell        className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',   label: () => 'Created a follow-up reminder' },
  follow_up_completed: { icon: <Bell        className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',       label: () => 'Completed a follow-up' },
  campaign_started:    { icon: <Megaphone   className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',          label: (e) => `Started campaign: "${e.metadata.campaign_name ?? ''}"` },
  campaign_paused:     { icon: <Megaphone   className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',   label: (e) => `Paused campaign: "${e.metadata.campaign_name ?? ''}"` },
  campaign_completed:  { icon: <Megaphone   className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',       label: (e) => `Campaign completed: "${e.metadata.campaign_name ?? ''}"` },
  member_invited:      { icon: <UserPlus     className="h-3.5 w-3.5" />, color: 'bg-secondary text-foreground',  label: (e) => `Invited ${e.metadata.email ?? 'a member'}` },
}

const TYPE_OPTIONS = [
  { value: '',                label: 'All events'    },
  { value: 'email_sent',      label: 'Emails sent'   },
  { value: 'email_replied',   label: 'Replies'       },
  { value: 'lead_created',    label: 'New leads'     },
  { value: 'campaign_started',label: 'Campaigns'     },
  { value: 'follow_up_created',label: 'Follow-ups'   },
]

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(' ')
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')
  }
  return email[0]?.toUpperCase() ?? '?'
}

const AVATAR_COLORS = [
  'bg-primary', 'bg-primary', 'bg-primary',
  'bg-primary', 'bg-primary', 'bg-primary',
]
function avatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

interface WorkspaceActivityFeedProps {
  events:   ActivityEvent[]
  loading?: boolean
}

const PAGE_SIZE = 10

export function WorkspaceActivityFeed({ events, loading }: WorkspaceActivityFeedProps) {
  const [filter,  setFilter]  = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    if (!filter) return events
    return events.filter((e) => e.type === filter)
  }, [events, filter])

  const shown = filtered.slice(0, visible)

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5 text-foreground" />
            Activity feed
            <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
          </CardTitle>

          {/* Type filter */}
          <div className="flex flex-wrap gap-1">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setFilter(opt.value); setVisible(PAGE_SIZE) }}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                  filter === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading && (
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <div className="h-3.5 w-48 rounded bg-muted" />
                  <div className="h-3 w-32 rounded bg-muted" />
                </div>
                <div className="h-3 w-12 rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {!loading && shown.length === 0 && (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No activity yet
          </div>
        )}

        {!loading && (
          <div className="space-y-0 divide-y">
            {shown.map((event) => {
              const cfg   = EVENT_CONFIGS[event.type]
              const label = cfg ? cfg.label(event) : event.type.replace(/_/g, ' ')

              return (
                <div key={event.id} className="flex items-start gap-3 py-3 hover:bg-muted/20 -mx-2 px-2 rounded-md transition-colors">
                  {/* User avatar */}
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-primary-foreground text-xs font-semibold shrink-0',
                    avatarColor(event.user_id),
                  )}>
                    {initials(event.user_name, event.user_email)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {event.user_name ?? event.user_email.split('@')[0]}
                      </span>
                      {/* Event icon badge */}
                      {cfg && (
                        <span className={cn(
                          'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                          cfg.color,
                        )}>
                          {cfg.icon}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {label}
                    </p>
                  </div>

                  {/* Time */}
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
                    {relativeTime(event.created_at)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {!loading && filtered.length > visible && (
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ChevronDown className="h-4 w-4" />
            Load more ({filtered.length - visible} remaining)
          </button>
        )}
      </CardContent>
    </Card>
  )
}

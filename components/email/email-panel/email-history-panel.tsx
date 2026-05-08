'use client'

import * as React from 'react'
import {
  Mail, Eye, MousePointer, Reply, AlertTriangle,
  Send, Clock, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EmailHistoryItem, EmailHistoryStatus } from '@/components/leads/detail/types'

interface EmailHistoryPanelProps {
  emails: EmailHistoryItem[]
}

// ── Status visual config ──────────────────────────────────────────────────
const STATUS: Record<EmailHistoryStatus, {
  Icon:  React.ComponentType<{ className?: string }>
  label: string
  dot:   string
  badge: string
}> = {
  queued:  { Icon: Clock,         label: 'Queued',  dot: 'bg-gray-400',     badge: 'text-gray-500 bg-gray-100' },
  sending: { Icon: Send,          label: 'Sending', dot: 'bg-secondary',     badge: 'text-foreground bg-secondary' },
  sent:    { Icon: Mail,          label: 'Sent',    dot: 'bg-gray-400',     badge: 'text-gray-500 bg-gray-100' },
  failed:  { Icon: AlertTriangle, label: 'Failed',  dot: 'bg-secondary',      badge: 'text-foreground bg-secondary' },
  bounced: { Icon: AlertTriangle, label: 'Bounced', dot: 'bg-secondary',      badge: 'text-foreground bg-secondary' },
  opened:  { Icon: Eye,           label: 'Opened',  dot: 'bg-secondary',     badge: 'text-foreground bg-secondary' },
  clicked: { Icon: MousePointer,  label: 'Clicked', dot: 'bg-secondary',     badge: 'text-foreground bg-secondary' },
  replied: { Icon: Reply,         label: 'Replied', dot: 'bg-secondary',  badge: 'text-foreground bg-secondary' },
}

export function EmailHistoryPanel({ emails }: EmailHistoryPanelProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Mail className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">No emails sent yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Compose your first email to this lead above.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 space-y-1.5">
      {emails.map((email) => {
        const cfg        = STATUS[email.status]
        const Icon       = cfg.Icon
        const isExpanded = expandedId === email.id

        return (
          <div
            key={email.id}
            className={cn(
              'overflow-hidden rounded-xl border transition-all',
              isExpanded ? 'border-primary/30' : 'border-border'
            )}
          >
            {/* Row */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : email.id)}
              className="group flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
            >
              {/* Status dot */}
              <div className={cn('h-2 w-2 shrink-0 rounded-full', cfg.dot)} />

              {/* Subject + sender */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{email.subject}</p>
                {email.sender_name && (
                  <p className="text-xs text-muted-foreground truncate">{email.sender_name}</p>
                )}
              </div>

              {/* Status badge + date */}
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className={cn(
                  'rounded-full px-1.5 py-px text-[9px] font-semibold',
                  cfg.badge
                )}>
                  {cfg.label}
                </span>
                {email.sent_at && (
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    {shortDate(email.sent_at)}
                  </span>
                )}
              </div>

              {isExpanded
                ? <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
                : <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              }
            </button>

            {/* Expanded */}
            {isExpanded && (
              <div className="border-t border-border/50 bg-muted/20 px-3 py-3 space-y-3">

                {/* Engagement indicators */}
                <div className="flex flex-wrap gap-2">
                  {([
                    { label: 'Opened',  ts: email.opened_at,  Icon: Eye,          color: 'text-foreground' },
                    { label: 'Clicked', ts: email.clicked_at, Icon: MousePointer, color: 'text-foreground' },
                    { label: 'Replied', ts: email.replied_at, Icon: Reply,        color: 'text-foreground' },
                  ] as const).filter((e) => e.ts).map(({ label, ts, Icon: I, color }) => (
                    <span key={label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <I className={cn('h-3 w-3', color)} />
                      {label} · {shortDate(ts!)}
                    </span>
                  ))}
                  {email.bounced_at && (
                    <span className="flex items-center gap-1 text-[10px] text-foreground">
                      <AlertTriangle className="h-3 w-3" />
                      Bounced · {shortDate(email.bounced_at)}
                    </span>
                  )}
                </div>

                {/* Body preview */}
                {email.body_html && (
                  <div
                    className="rounded-lg border border-border/50 bg-background p-3 text-xs leading-relaxed text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: sanitise(email.body_html) }}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function shortDate(iso: string): string {
  const d    = new Date(iso)
  const now  = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function sanitise(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
             .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
}

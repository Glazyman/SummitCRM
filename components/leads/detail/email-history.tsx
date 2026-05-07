'use client'

import * as React from 'react'
import {
  Mail, Eye, MousePointer, Reply,
  AlertTriangle, ChevronDown, ChevronUp, Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EmailHistoryItem, EmailHistoryStatus } from './types'

interface EmailHistoryProps {
  emails: EmailHistoryItem[]
}

// ── Status badge config ────────────────────────────────────────────────────
const EMAIL_STATUS_META: Record<EmailHistoryStatus, {
  label:  string
  badge:  string
  Icon:   React.ComponentType<{ className?: string }>
}> = {
  queued:   { label: 'Queued',  badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',           Icon: Mail },
  sending:  { label: 'Sending', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',         Icon: Send },
  sent:     { label: 'Sent',    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',            Icon: Mail },
  failed:   { label: 'Failed',  badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             Icon: AlertTriangle },
  bounced:  { label: 'Bounced', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             Icon: AlertTriangle },
  opened:   { label: 'Opened',  badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',         Icon: Eye },
  clicked:  { label: 'Clicked', badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',         Icon: MousePointer },
  replied:  { label: 'Replied', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', Icon: Reply },
}

export function EmailHistory({ emails }: EmailHistoryProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Mail className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No emails sent yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
      {emails.map((email) => {
        const statusMeta = EMAIL_STATUS_META[email.status]
        const StatusIcon = statusMeta.Icon
        const isExpanded = expandedId === email.id

        return (
          <div key={email.id}>
            {/* Row */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : email.id)}
              className="group w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                {/* Status icon */}
                <div className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  statusMeta.badge.split(' ').slice(0, 2).join(' ')
                )}>
                  <StatusIcon className="h-3.5 w-3.5" />
                </div>

                {/* Subject + sender */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{email.subject}</p>
                  {email.sender_name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {email.sender_name}
                    </p>
                  )}
                </div>

                {/* Status badge + date + chevron */}
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn(
                    'hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    statusMeta.badge
                  )}>
                    {statusMeta.label}
                  </span>

                  {email.sent_at && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {shortDate(email.sent_at)}
                    </span>
                  )}

                  {isExpanded
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  }
                </div>
              </div>

              {/* Engagement metrics */}
              {(email.opened_at || email.clicked_at || email.replied_at) && !isExpanded && (
                <div className="mt-1.5 flex gap-3 pl-10">
                  {email.opened_at && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="h-3 w-3 text-blue-500" /> Opened
                    </span>
                  )}
                  {email.clicked_at && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MousePointer className="h-3 w-3 text-teal-500" /> Clicked
                    </span>
                  )}
                  {email.replied_at && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Reply className="h-3 w-3 text-emerald-500" /> Replied
                    </span>
                  )}
                </div>
              )}
            </button>

            {/* Expanded: body preview + timeline */}
            {isExpanded && (
              <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">

                {/* Engagement timeline */}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {email.sent_at && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-gray-400" />
                      Sent {longDate(email.sent_at)}
                    </span>
                  )}
                  {email.opened_at && (
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3 w-3 text-blue-500" />
                      Opened {longDate(email.opened_at)}
                    </span>
                  )}
                  {email.clicked_at && (
                    <span className="flex items-center gap-1.5">
                      <MousePointer className="h-3 w-3 text-teal-500" />
                      Clicked {longDate(email.clicked_at)}
                    </span>
                  )}
                  {email.replied_at && (
                    <span className="flex items-center gap-1.5">
                      <Reply className="h-3 w-3 text-emerald-500" />
                      Replied {longDate(email.replied_at)}
                    </span>
                  )}
                </div>

                {/* Email body */}
                {email.body_html && (
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitiseHtml(email.body_html) }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/** Very basic sanitisation — strip script/style tags. Replace with DOMPurify in production. */
function sanitiseHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
}

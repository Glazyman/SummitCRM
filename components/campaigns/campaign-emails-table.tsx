'use client'

import * as React from 'react'
import { Eye, MousePointer, Reply, AlertTriangle, Clock, Send, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CampaignEmailRow } from './types'

const STATUS_CONFIG: Record<string, {
  label: string; icon: React.ComponentType<{ className?: string }>; color: string
}> = {
  queued:  { label: 'Queued',   icon: Clock,         color: 'text-gray-400'    },
  sending: { label: 'Sending',  icon: Send,          color: 'text-blue-500'    },
  sent:    { label: 'Sent',     icon: CheckCircle2,  color: 'text-gray-400'    },
  failed:  { label: 'Failed',   icon: XCircle,       color: 'text-red-500'     },
  bounced: { label: 'Bounced',  icon: AlertTriangle, color: 'text-red-500'     },
  opened:  { label: 'Opened',   icon: Eye,           color: 'text-blue-500'    },
  clicked: { label: 'Clicked',  icon: MousePointer,  color: 'text-teal-500'    },
  replied: { label: 'Replied',  icon: Reply,         color: 'text-emerald-500' },
  cancelled:{ label:'Cancelled',icon: XCircle,       color: 'text-muted-foreground' },
}

interface CampaignEmailsTableProps {
  emails:  CampaignEmailRow[]
  loading?: boolean
}

export function CampaignEmailsTable({ emails, loading }: CampaignEmailsTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    )
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
        <Send className="h-8 w-8 opacity-30" />
        <p className="text-sm">No emails yet — campaign hasn&apos;t started sending.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {['Lead', 'Step', 'Subject', 'Status', 'Sent', 'Opened', 'Clicked', 'Replied'].map((h) => (
              <th key={h} className="pb-2.5 pr-4 text-left text-xs font-semibold text-muted-foreground last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {emails.map((row) => {
            const cfg = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.sent
            const Icon = cfg.icon
            return (
              <tr key={row.email_id} className="group hover:bg-muted/20 transition-colors">
                <td className="py-3 pr-4">
                  <div>
                    <p className="font-medium truncate max-w-[140px]">{row.lead_name || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[140px]">{row.lead_email}</p>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    #{row.step_number}
                  </span>
                </td>
                <td className="py-3 pr-4 max-w-[200px]">
                  <p className="truncate text-xs">{row.subject}</p>
                </td>
                <td className="py-3 pr-4">
                  <span className={cn('flex items-center gap-1', cfg.color)}>
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{cfg.label}</span>
                  </span>
                </td>
                <td className="py-3 pr-4 text-xs text-muted-foreground tabular-nums">
                  {row.sent_at ? shortDate(row.sent_at) : '—'}
                </td>
                <td className="py-3 pr-4 text-xs">
                  {row.opened_at ? (
                    <span className="flex items-center gap-1 text-blue-500">
                      <Eye className="h-3 w-3" /> {shortDate(row.opened_at)}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="py-3 pr-4 text-xs">
                  {row.clicked_at ? (
                    <span className="flex items-center gap-1 text-teal-500">
                      <MousePointer className="h-3 w-3" /> {shortDate(row.clicked_at)}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="py-3 text-xs">
                  {row.replied_at ? (
                    <span className="flex items-center gap-1 text-emerald-500">
                      <Reply className="h-3 w-3" /> {shortDate(row.replied_at)}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function shortDate(iso: string): string {
  const d   = new Date(iso)
  const now = new Date()
  if (now.getTime() - d.getTime() < 86400000) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

'use client'

import * as React from 'react'
import { Users, Send, Eye, MousePointer, Reply, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Campaign } from './types'

interface CampaignStatsCardsProps {
  campaign: Campaign
  className?: string
}

export function CampaignStatsCards({ campaign, className }: CampaignStatsCardsProps) {
  const {
    total_leads, emails_sent,
    emails_opened, emails_clicked, emails_replied, emails_bounced,
  } = campaign

  const pct = (n: number) => emails_sent > 0 ? Math.round((n / emails_sent) * 1000) / 10 : 0

  const stats = [
    {
      label:  'Total leads',
      value:  total_leads.toLocaleString(),
      icon:   <Users className="h-4 w-4" />,
      color:  'text-blue-500 bg-blue-100/60 dark:bg-blue-900/20',
      sub:    null,
    },
    {
      label:  'Emails sent',
      value:  emails_sent.toLocaleString(),
      icon:   <Send className="h-4 w-4" />,
      color:  'text-gray-500 bg-gray-100/60 dark:bg-gray-800/40',
      sub:    total_leads > 0 ? `${Math.round((emails_sent / (total_leads)) * 100)}% of total` : null,
    },
    {
      label:  'Open rate',
      value:  emails_sent > 0 ? `${pct(emails_opened)}%` : '—',
      icon:   <Eye className="h-4 w-4" />,
      color:  'text-blue-500 bg-blue-100/60 dark:bg-blue-900/20',
      sub:    emails_sent > 0 ? `${emails_opened.toLocaleString()} opens` : null,
    },
    {
      label:  'Click rate',
      value:  emails_sent > 0 ? `${pct(emails_clicked)}%` : '—',
      icon:   <MousePointer className="h-4 w-4" />,
      color:  'text-teal-500 bg-teal-100/60 dark:bg-teal-900/20',
      sub:    emails_sent > 0 ? `${emails_clicked.toLocaleString()} clicks` : null,
    },
    {
      label:  'Reply rate',
      value:  emails_sent > 0 ? `${pct(emails_replied)}%` : '—',
      icon:   <Reply className="h-4 w-4" />,
      color:  'text-emerald-500 bg-emerald-100/60 dark:bg-emerald-900/20',
      sub:    emails_sent > 0 ? `${emails_replied.toLocaleString()} replies` : null,
    },
    {
      label:  'Bounce rate',
      value:  emails_sent > 0 ? `${pct(emails_bounced)}%` : '—',
      icon:   <AlertTriangle className="h-4 w-4" />,
      color:  emails_bounced > 5 ? 'text-red-500 bg-red-100/60 dark:bg-red-900/20' : 'text-gray-400 bg-gray-100/60 dark:bg-gray-800/40',
      sub:    emails_sent > 0 ? `${emails_bounced.toLocaleString()} bounces` : null,
    },
  ]

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6', className)}>
      {stats.map(({ label, value, icon, color, sub }) => (
        <div key={label} className="rounded-2xl border border-border bg-card p-4">
          <div className={cn('mb-3 flex h-8 w-8 items-center justify-center rounded-lg', color)}>
            {icon}
          </div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
          {sub && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ── Progress bar showing emails sent vs total ──────────────────────────────
export function CampaignProgress({ campaign }: { campaign: Campaign }) {
  const total   = campaign.total_leads
  const sent    = campaign.emails_sent
  const pct     = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0

  if (total === 0) return null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{sent.toLocaleString()} of {total.toLocaleString()} emails sent</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            pct === 100 ? 'bg-emerald-500' : 'bg-primary'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

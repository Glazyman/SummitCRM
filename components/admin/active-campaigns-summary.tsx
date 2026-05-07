'use client'

/**
 * components/admin/active-campaigns-summary.tsx
 *
 * Cards for each running/scheduled/paused campaign.
 * Shows: name, status badge, progress bar, open rate, quick actions.
 */

import React, { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }    from '@/components/ui/badge'
import { Button }   from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Megaphone, Play, Pause, ExternalLink, ArrowRight, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CampaignSummary } from './types'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; dot?: boolean }> = {
  running:   { label: 'Running',   color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',   icon: <Play  className="h-3 w-3" />, dot: true },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       icon: <Play  className="h-3 w-3" /> },
  paused:    { label: 'Paused',    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: <Pause className="h-3 w-3" /> },
}

interface Props {
  campaigns: CampaignSummary[]
  isAdmin:   boolean
  loading?:  boolean
}

export function ActiveCampaignsSummary({ campaigns, isAdmin, loading }: Props) {
  const [pausing,  setPausing]  = useState<Set<string>>(new Set())
  const [resuming, setResuming] = useState<Set<string>>(new Set())

  const handleAction = async (id: string, action: 'pause' | 'resume') => {
    const set    = action === 'pause' ? setPausing : setResuming
    set((p) => new Set([...p, id]))
    try {
      await fetch(`/api/campaigns/${id}/${action}`, { method: 'POST' })
    } finally {
      set((p) => { const n = new Set(p); n.delete(id); return n })
    }
  }

  if (!loading && campaigns.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-5 w-5 text-green-500" />
            Active campaigns
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Megaphone className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No active campaigns</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/campaigns/new">Start a campaign</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-5 w-5 text-green-500" />
          Active campaigns
          <Badge variant="secondary" className="ml-auto text-xs">{campaigns.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {loading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg border p-4 space-y-3">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-2 w-full rounded bg-muted" />
            <div className="flex gap-2">
              <div className="h-6 w-16 rounded bg-muted" />
              <div className="h-6 w-16 rounded bg-muted" />
            </div>
          </div>
        ))}
        {!loading && campaigns.map((campaign) => {
          const cfg       = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.running
          const sentPct   = campaign.total_leads > 0
            ? Math.round((campaign.emails_sent / campaign.total_leads) * 100)
            : 0

          return (
            <div
              key={campaign.id}
              className="rounded-lg border p-4 space-y-3 hover:border-muted-foreground/30 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm leading-snug truncate">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {campaign.total_leads.toLocaleString()} leads
                  </p>
                </div>
                <div className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shrink-0',
                  cfg.color,
                )}>
                  {cfg.dot && (
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                  )}
                  {cfg.label}
                </div>
              </div>

              {/* Progress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{campaign.emails_sent.toLocaleString()} sent</span>
                  <span>{sentPct}%</span>
                </div>
                <Progress value={sentPct} className="h-2" />
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className={cn(
                    'font-semibold',
                    campaign.open_rate >= 25 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                  )}>
                    {campaign.open_rate}%
                  </span>
                  <span>open rate</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs gap-1">
                  <Link href={`/campaigns/${campaign.id}`}>
                    <ExternalLink className="h-3 w-3" /> View
                  </Link>
                </Button>
                {(isAdmin || campaign.status === 'running') && (
                  campaign.status === 'running' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction(campaign.id, 'pause')}
                      disabled={pausing.has(campaign.id)}
                      className="h-7 px-2 text-xs gap-1"
                    >
                      <Pause className="h-3 w-3" />
                      {pausing.has(campaign.id) ? 'Pausing…' : 'Pause'}
                    </Button>
                  ) : campaign.status === 'paused' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction(campaign.id, 'resume')}
                      disabled={resuming.has(campaign.id)}
                      className="h-7 px-2 text-xs gap-1"
                    >
                      <Play className="h-3 w-3" />
                      {resuming.has(campaign.id) ? 'Resuming…' : 'Resume'}
                    </Button>
                  ) : null
                )}
              </div>
            </div>
          )
        })}

        <Link
          href="/campaigns"
          className="flex items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View all campaigns <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  )
}

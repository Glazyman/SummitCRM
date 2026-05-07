'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Plus, Search, Filter, Send, Users, MoreHorizontal,
  Play, Pause, Trash2, Eye, BarChart2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CampaignStatusBadge } from '@/components/campaigns/campaign-status-badge'
import type { Campaign, CampaignStatus } from '@/components/campaigns/types'

const STATUS_FILTERS: Array<{ value: CampaignStatus | 'all'; label: string }> = [
  { value: 'all',       label: 'All'       },
  { value: 'running',   label: 'Running'   },
  { value: 'draft',     label: 'Draft'     },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'paused',    label: 'Paused'    },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface CampaignsClientProps {
  initialCampaigns: Campaign[]
}

export function CampaignsClient({ initialCampaigns }: CampaignsClientProps) {
  const [campaigns, setCampaigns] = React.useState(initialCampaigns)
  const [search,    setSearch]    = React.useState('')
  const [status,    setStatus]    = React.useState<CampaignStatus | 'all'>('all')
  const [loading,   setLoading]   = React.useState<Record<string, boolean>>({})

  const filtered = campaigns.filter((c) => {
    if (status !== 'all' && c.status !== status) return false
    if (search) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
    }
    return true
  })

  function pct(n: number, of: number) {
    return of > 0 ? `${Math.round((n / of) * 100)}%` : '—'
  }

  async function handleAction(id: string, action: 'pause' | 'resume' | 'cancel') {
    setLoading((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`/api/campaigns/${id}/${action}`, { method: 'POST' })
      if (res.ok) {
        const statusMap: Record<string, CampaignStatus> = { pause: 'paused', resume: 'running', cancel: 'cancelled' }
        setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, status: statusMap[action] } : c))
      }
    } finally {
      setLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Campaigns</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Bulk email sequences targeting lead batches.</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/campaigns/new">
            <Plus className="h-4 w-4" />
            New campaign
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="h-9 w-full rounded-xl border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex overflow-x-auto gap-1 scrollbar-hide">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value as CampaignStatus | 'all')}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap',
                status === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Campaign list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Send className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No campaigns found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || status !== 'all' ? 'Try adjusting your filters.' : 'Create your first campaign to start sending.'}
            </p>
          </div>
          {!search && status === 'all' && (
            <Button asChild>
              <Link href="/campaigns/new"><Plus className="mr-1.5 h-4 w-4" />New campaign</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const sentPct = c.total_leads > 0
              ? Math.min(100, Math.round((c.emails_sent / c.total_leads) * 100))
              : 0
            const isLoading = loading[c.id]

            return (
              <div
                key={c.id}
                className="group overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md"
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                  {/* Main info */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="text-base font-semibold hover:text-primary transition-colors"
                      >
                        {c.name}
                      </Link>
                      <CampaignStatusBadge status={c.status} dot />
                    </div>
                    {c.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">{c.description}</p>
                    )}

                    {/* Stats row */}
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {c.total_leads.toLocaleString()} leads</span>
                      <span className="flex items-center gap-1"><Send className="h-3 w-3" /> {c.emails_sent.toLocaleString()} sent</span>
                      <span>Open {pct(c.emails_opened, c.emails_sent)}</span>
                      <span>Click {pct(c.emails_clicked, c.emails_sent)}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">Reply {pct(c.emails_replied, c.emails_sent)}</span>
                      {c.emails_bounced > 0 && (
                        <span className="text-red-500">Bounce {pct(c.emails_bounced, c.emails_sent)}</span>
                      )}
                    </div>

                    {/* Progress bar */}
                    {c.total_leads > 0 && (
                      <div className="pt-0.5">
                        <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              sentPct === 100 ? 'bg-emerald-500' : c.status === 'paused' ? 'bg-amber-500' : 'bg-primary'
                            )}
                            style={{ width: `${sentPct}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{sentPct}% complete</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-start gap-1.5">
                    <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs">
                      <Link href={`/campaigns/${c.id}`}>
                        <BarChart2 className="h-3.5 w-3.5" />
                        Details
                      </Link>
                    </Button>

                    {c.status === 'running' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-amber-600 hover:text-amber-700"
                        onClick={() => handleAction(c.id, 'pause')}
                        disabled={isLoading}
                      >
                        <Pause className="h-3.5 w-3.5" />
                        Pause
                      </Button>
                    )}

                    {c.status === 'paused' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-emerald-600 hover:text-emerald-700"
                        onClick={() => handleAction(c.id, 'resume')}
                        disabled={isLoading}
                      >
                        <Play className="h-3.5 w-3.5" />
                        Resume
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

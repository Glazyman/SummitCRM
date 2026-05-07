'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }    from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Megaphone, ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CampaignRow } from './types'

type SortKey = 'name' | 'emails_sent' | 'open_rate' | 'click_rate' | 'reply_rate' | 'bounce_rate'

const STATUS_COLORS: Record<string, string> = {
  running:   'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  paused:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  completed: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
}

function RateCell({ value, good = 25, warn = 15 }: { value: number; good?: number; warn?: number }) {
  return (
    <div className="space-y-1">
      <span className={cn(
        'font-semibold text-sm',
        value >= good ? 'text-emerald-600 dark:text-emerald-400' :
        value >= warn ? '' : 'text-orange-500',
      )}>
        {value}%
      </span>
      <Progress
        value={Math.min(value * 2, 100)}
        className={cn(
          'h-1 w-16',
          value >= good ? '[&>div]:bg-emerald-500' :
          value >= warn ? '' : '[&>div]:bg-orange-400',
        )}
      />
    </div>
  )
}

function SortBtn({ col, sort, onSort }: { col: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void }) {
  const active = sort.key === col
  return (
    <button onClick={() => onSort(col)} className="flex items-center gap-1 group">
      {active
        ? sort.dir === 'asc'
          ? <ChevronUp   className="h-3.5 w-3.5 text-primary" />
          : <ChevronDown className="h-3.5 w-3.5 text-primary" />
        : <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
      }
    </button>
  )
}

interface Props {
  campaigns: CampaignRow[]
  loading?:  boolean
}

export function CampaignComparisonTable({ campaigns, loading }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'open_rate', dir: 'desc' })

  const sorted = useMemo(() => [...campaigns].sort((a, b) => {
    const va = a[sort.key] ?? 0
    const vb = b[sort.key] ?? 0
    return sort.dir === 'asc' ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1)
  }), [campaigns, sort])

  const onSort = (key: SortKey) =>
    setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }))

  const cols: Array<{ key: SortKey; label: string }> = [
    { key: 'emails_sent', label: 'Sent'       },
    { key: 'open_rate',   label: 'Open rate'  },
    { key: 'click_rate',  label: 'Click rate' },
    { key: 'reply_rate',  label: 'Reply rate' },
    { key: 'bounce_rate', label: 'Bounce'     },
  ]

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-5 w-5 text-green-500" />
          Campaign comparison
          <Badge variant="secondary" className="ml-auto text-xs">{campaigns.length} campaigns</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campaign</th>
                {cols.map(c => (
                  <th key={c.key} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {c.label}
                      <SortBtn col={c.key} sort={sort} onSort={onSort} />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Started</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 w-20 rounded bg-muted" /></td>
                  ))}
                </tr>
              ))}
              {!loading && sorted.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 max-w-[200px]">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="font-medium hover:underline flex items-center gap-1 group"
                        >
                          <span className="truncate">{c.name}</span>
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 shrink-0" />
                        </Link>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge className={cn('text-xs', STATUS_COLORS[c.status] ?? '')}>{c.status}</Badge>
                          <span className="text-xs text-muted-foreground">{c.total_leads} leads</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{c.emails_sent.toLocaleString()}</td>
                  <td className="px-4 py-3"><RateCell value={c.open_rate}   good={25} warn={15} /></td>
                  <td className="px-4 py-3"><RateCell value={c.click_rate}  good={5}  warn={2}  /></td>
                  <td className="px-4 py-3"><RateCell value={c.reply_rate}  good={5}  warn={2}  /></td>
                  <td className="px-4 py-3">
                    <span className={cn('font-semibold', c.bounce_rate > 5 ? 'text-red-500' : c.bounce_rate > 2 ? 'text-orange-500' : '')}>
                      {c.bounce_rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {c.started_at ? new Date(c.started_at).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No campaigns found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

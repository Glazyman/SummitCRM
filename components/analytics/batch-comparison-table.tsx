'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Layers, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BatchRow } from './types'

type SortKey = 'lead_count' | 'emails_sent' | 'open_rate' | 'reply_rate' | 'conversion_rate'

interface Props { batches: BatchRow[]; loading?: boolean }

export function BatchComparisonTable({ batches, loading }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'open_rate', dir: 'desc' })
  const sorted = useMemo(() =>
    [...batches].sort((a, b) => {
      const d = sort.dir === 'asc' ? 1 : -1
      return (a[sort.key] > b[sort.key] ? 1 : -1) * d
    }), [batches, sort])

  const onSort = (key: SortKey) =>
    setSort(p => ({ key, dir: p.key === key && p.dir === 'desc' ? 'asc' : 'desc' }))

  const cols: Array<{ key: SortKey; label: string }> = [
    { key: 'lead_count',      label: 'Leads'       },
    { key: 'emails_sent',     label: 'Sent'        },
    { key: 'open_rate',       label: 'Open rate'   },
    { key: 'reply_rate',      label: 'Reply rate'  },
    { key: 'conversion_rate', label: 'Conversion'  },
  ]

  const maxLeads = Math.max(...batches.map(b => b.lead_count), 1)

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-5 w-5 text-foreground" />
          Batch comparison
          <Badge variant="secondary" className="ml-auto text-xs">{batches.length} batches</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Batch</th>
                {cols.map(c => (
                  <th key={c.key} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                    <button onClick={() => onSort(c.key)} className="flex items-center gap-1 group hover:text-foreground">
                      {c.label}
                      {sort.key === c.key
                        ? sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />
                        : <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                      }
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Added</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 w-16 rounded bg-muted" /></td>
                  ))}
                </tr>
              ))}
              {!loading && sorted.map(b => (
                <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="font-medium truncate">{b.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1.5">
                      <span className="font-semibold">{b.lead_count.toLocaleString()}</span>
                      <Progress value={Math.round((b.lead_count / maxLeads) * 100)} className="h-1 w-20" />
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{b.emails_sent.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={cn('font-semibold', b.open_rate >= 30 ? 'text-foreground' : b.open_rate >= 20 ? '' : 'text-foreground')}>
                      {b.open_rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('font-semibold', b.reply_rate >= 7 ? 'text-foreground' : b.reply_rate >= 4 ? '' : 'text-foreground')}>
                      {b.reply_rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('font-semibold', b.conversion_rate >= 2 ? 'text-foreground' : b.conversion_rate >= 1 ? '' : 'text-muted-foreground')}>
                      {b.conversion_rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(b.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No batches found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_CONFIG } from '@/components/leads/status-config'
import type { LeadStatus } from '@/types/database'

const DISPLAY_ORDER: LeadStatus[] = [
  'new', 'called', 'voicemail', 'no_answer', 'wrong_number',
  'sold_already', 'emailed', 'contacted', 'replied',
  'interested', 'not_interested', 'converted',
  'do_not_contact', 'unsubscribed',
]

export function LeadPipelineBreakdown({
  counts,
  loading,
}: {
  counts:   Record<string, number>
  loading?: boolean
}) {
  const total   = Object.values(counts).reduce((s, n) => s + n, 0)
  const ordered = DISPLAY_ORDER
    .filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => ({ status: s, count: counts[s] ?? 0, meta: STATUS_CONFIG[s] }))
    .filter((r) => r.meta)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-5 w-5 text-foreground" />
          Lead pipeline
          {!loading && total > 0 && (
            <span className="ml-auto text-xs text-muted-foreground font-normal">
              {total.toLocaleString()} total
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2.5 animate-pulse">
            {[70, 50, 35, 20, 15].map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-5 flex-1 rounded bg-muted" style={{ maxWidth: `${w}%` }} />
                <div className="h-3 w-8 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : ordered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No leads yet</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ordered.map(({ status, count, meta }) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              // Extract just the background class from the badge string
              const bgClass = meta.badge.split(' ')[0]
              return (
                <div key={status} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 text-xs text-muted-foreground truncate">
                    {meta.label}
                  </div>
                  <div className="relative flex-1 h-5 rounded-md overflow-hidden bg-muted/40">
                    <div
                      className={cn('h-full rounded-md', bgClass)}
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                  <div className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">
                    {count.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

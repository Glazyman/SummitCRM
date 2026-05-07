'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FunnelData } from './types'

const STATUS_LABELS: Record<string, string> = {
  new:            'New',
  contacted:      'Contacted',
  replied:        'Replied',
  interested:     'Interested',
  converted:      'Converted',
  do_not_contact: 'Do Not Contact',
  unsubscribed:   'Unsubscribed',
}

// Funnel stage colours: saturated blue → vibrant green
const STAGE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#22c55e']

// ── Custom tooltip ────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; percentage: number } }> }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border bg-background/95 backdrop-blur p-3 shadow-xl text-sm">
      <p className="font-semibold mb-1">{d.name}</p>
      <p className="text-muted-foreground">{d.value.toLocaleString()} leads</p>
      <p className="text-muted-foreground">{d.percentage}% of total</p>
    </div>
  )
}

interface Props {
  data:     FunnelData
  loading?: boolean
}

export function LeadFunnelChart({ data, loading }: Props) {
  // Transform for Recharts Funnel
  const chartData = data.funnel.map((s, i) => ({
    name:       STATUS_LABELS[s.status] ?? s.status,
    value:      s.count,
    percentage: s.percentage,
    fill:       STAGE_COLORS[i] ?? STAGE_COLORS[STAGE_COLORS.length - 1],
  }))

  // Calculate drop-off between stages
  const dropoffs = data.funnel.map((stage, i) => {
    if (i === 0) return null
    const prev = data.funnel[i - 1]
    const drop = prev.count > 0 ? Math.round((1 - stage.count / prev.count) * 1000) / 10 : 0
    return drop
  })

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-purple-500" />
          Lead conversion funnel
          <Badge variant="secondary" className="ml-auto text-xs">
            {data.total.toLocaleString()} total leads
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted/50" />
        ) : (
          <div className="flex flex-col gap-0">
            {data.funnel.map((stage, i) => {
              const maxWidth = 100
              const width = data.funnel[0].count > 0
                ? Math.max(20, Math.round((stage.count / data.funnel[0].count) * maxWidth))
                : maxWidth
              const color  = STAGE_COLORS[i] ?? STAGE_COLORS[STAGE_COLORS.length - 1]
              const drop   = dropoffs[i]

              return (
                <div key={stage.status}>
                  {/* Drop-off arrow between stages */}
                  {drop !== null && (
                    <div className="flex items-center justify-center py-1 gap-1.5 text-xs text-muted-foreground">
                      <ArrowDown className="h-3 w-3" />
                      <span className={cn('font-medium', drop > 60 ? 'text-red-500' : drop > 30 ? 'text-orange-500' : 'text-muted-foreground')}>
                        −{drop}% drop-off
                      </span>
                    </div>
                  )}

                  {/* Stage bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div
                        className="flex items-center justify-between rounded-lg px-4 py-3 text-white transition-all hover:opacity-90"
                        style={{
                          background:  color,
                          marginLeft:  `${(maxWidth - width) / 2}%`,
                          width:       `${width}%`,
                        }}
                      >
                        <span className="text-sm font-semibold">
                          {STATUS_LABELS[stage.status] ?? stage.status}
                        </span>
                        <div className="text-right">
                          <p className="text-sm font-bold">{stage.count.toLocaleString()}</p>
                          <p className="text-xs opacity-80">{stage.percentage}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Full breakdown pills */}
        {!loading && data.breakdown.length > 0 && (
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">All statuses</p>
            <div className="flex flex-wrap gap-2">
              {data.breakdown.map(s => (
                <div key={s.status} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
                  <span className="font-medium">{STATUS_LABELS[s.status] ?? s.status}</span>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                    {s.count.toLocaleString()}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

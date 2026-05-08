'use client'

import React, { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Area, AreaChart,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimeSeriesPoint } from './types'

// ── Series config ─────────────────────────────────────────────────────────
const SERIES = [
  { key: 'sent',    label: 'Sent',    color: '#111111', fillOpacity: 0.08 },
  { key: 'opened',  label: 'Opened',  color: '#444444', fillOpacity: 0.07 },
  { key: 'replied', label: 'Replied', color: '#777777', fillOpacity: 0.06 },
  { key: 'bounced', label: 'Bounced', color: '#aaaaaa', fillOpacity: 0.05 },
] as const

type SeriesKey = typeof SERIES[number]['key']

// ── Custom tooltip ────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[140px] rounded-xl border border-border bg-card/95 p-3 text-sm shadow-card backdrop-blur">
      <p className="font-semibold mb-2 text-foreground">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ── X-axis formatter ──────────────────────────────────────────────────────
function fmtDate(d: string, total: number): string {
  const date = new Date(d)
  if (total <= 14) return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  // Show every 5th label for longer ranges
  return date.getDate() % 5 === 0
    ? date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
    : ''
}

interface Props {
  data:     TimeSeriesPoint[]
  loading?: boolean
}

export function EmailTimeSeriesChart({ data, loading }: Props) {
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set())
  const [chartType, setChartType] = useState<'line' | 'area'>('area')

  const toggleSeries = (key: SeriesKey) => {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const visibleSeries = SERIES.filter(s => !hidden.has(s.key))

  const ChartComponent = chartType === 'area' ? AreaChart : LineChart

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Email activity over time
          </CardTitle>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Series toggles */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {SERIES.map(s => (
                <button
                  key={s.key}
                  onClick={() => toggleSeries(s.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all border',
                    hidden.has(s.key)
                      ? 'border-border text-muted-foreground bg-transparent opacity-50'
                      : 'border-border bg-secondary text-foreground',
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
            {/* Chart type toggle */}
            <div className="flex rounded-lg border overflow-hidden text-xs">
              {(['area', 'line'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setChartType(t)}
                  className={cn(
                    'px-2.5 py-1 font-medium capitalize transition-colors',
                    chartType === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {loading ? (
          <div className="h-72 flex items-center justify-center">
            <div className="h-full w-full animate-pulse rounded-lg bg-muted/50" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <TrendingUp className="w-10 h-10 opacity-20" />
            <p className="text-sm">No email data for the selected period.</p>
            <p className="text-xs opacity-70">Send emails or adjust the date range to see results.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <ChartComponent data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                {SERIES.map(s => (
                  <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={s.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0}   />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(d) => fmtDate(d, data.length)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />
              {visibleSeries.map(s =>
                chartType === 'area' ? (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#grad-${s.key})`}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                  />
                ) : (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                  />
                )
              )}
            </ChartComponent>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

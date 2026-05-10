'use client'

import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RepStat } from './types'

type Metric = 'calls_count' | 'leads_assigned' | 'emails_sent'

const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: 'calls_count',    label: 'Calls',          color: 'hsl(214 89% 52%)' },
  { key: 'leads_assigned', label: 'Leads Assigned',  color: 'hsl(142 71% 45%)' },
  { key: 'emails_sent',    label: 'Emails Sent',     color: 'hsl(262 80% 58%)' },
]

interface CustomTooltipProps {
  active?:  boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?:   string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-card shadow-card px-4 py-3 text-sm space-y-1.5">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium tabular-nums">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

interface RepPerformanceChartProps {
  stats:    RepStat[]
  loading?: boolean
}

export function RepPerformanceChart({ stats, loading }: RepPerformanceChartProps) {
  const [active, setActive] = useState<Set<Metric>>(new Set(['calls_count', 'leads_assigned', 'emails_sent']))

  // Sort by calls desc, take top 15
  const chartData = [...stats]
    .sort((a, b) => b.calls_count - a.calls_count)
    .slice(0, 15)
    .map((s) => ({
      name:           (s.full_name ?? s.user_email.split('@')[0]).split(' ')[0] + (s.full_name?.split(' ')[1] ? ` ${s.full_name.split(' ')[1][0]}.` : ''),
      fullName:       s.full_name ?? s.user_email,
      calls_count:    s.calls_count,
      leads_assigned: s.leads_assigned,
      emails_sent:    s.emails_sent,
    }))

  function toggleMetric(key: Metric) {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(key) && next.size === 1) return prev // keep at least one
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart2 className="h-5 w-5 text-foreground" />
            Rep performance
          </CardTitle>

          {/* Metric toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            {METRICS.map(({ key, label, color }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleMetric(key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                  active.has(key)
                    ? 'border-border bg-card text-foreground shadow-sm'
                    : 'border-transparent text-muted-foreground opacity-50',
                )}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {loading ? (
          <div className="h-72 flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
            No rep data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              barCategoryGap="28%"
              barGap={3}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(220 16% 87%)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: 'hsl(220 10% 45%)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'hsl(220 10% 45%)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(220 14% 90% / 0.5)' }} />

              {METRICS.filter((m) => active.has(m.key)).map(({ key, label, color }) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={label}
                  fill={color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

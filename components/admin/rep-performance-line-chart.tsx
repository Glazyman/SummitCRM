'use client'

import React from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import type { RepStat } from './types'

const REP_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#d97706',
  '#0891b2', '#db2777', '#65a30d', '#4f46e5', '#0d9488',
]

interface RepPerformanceLineChartProps {
  stats: RepStat[]
  loading?: boolean
}

export function RepPerformanceLineChart({ stats, loading }: RepPerformanceLineChartProps) {
  const reps = [...stats]
    .sort((a, b) => b.calls_count - a.calls_count)
    .slice(0, 10)

  const points: Array<Record<string, string | number>> = [
    { step: 'Start' },
    { step: 'Calls' },
  ]

  reps.forEach((rep) => {
    points[0][rep.user_id] = 0
    points[1][rep.user_id] = rep.calls_count
  })

  if (loading) {
    return <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">Loading graph…</div>
  }

  if (reps.length === 0) {
    return <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">No rep data yet</div>
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Calls Trend by Rep</p>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={points} margin={{ top: 10, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="step" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
          <Tooltip />
          {reps.map((rep, idx) => (
            <Line
              key={rep.user_id}
              type="monotone"
              dataKey={rep.user_id}
              name={rep.full_name ?? rep.user_email}
              stroke={REP_COLORS[idx % REP_COLORS.length]}
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

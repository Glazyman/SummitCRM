'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge }   from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Mail, MousePointer, MessageSquare, AlertCircle, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EmailMetrics } from './types'

interface MetricCardProps {
  icon:      React.ReactNode
  label:     string
  value:     string
  sub?:      string
  trend?:    number   // positive = better
  alert?:    boolean
  color:     string
  bgColor:   string
  loading?:  boolean
}

function MetricCard({ icon, label, value, sub, trend, alert, color, bgColor, loading }: MetricCardProps) {
  return (
    <Card className={cn('relative overflow-hidden transition-all hover:shadow-md', alert && 'border-red-300 dark:border-red-700')}>
      {/* Subtle top accent line */}
      <div className={cn('absolute top-0 left-0 right-0 h-0.5', color.replace('text-', 'bg-'))} />
      <CardContent className="p-5">
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-8 w-8 rounded-lg bg-muted" />
            <div className="h-7 w-20 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted" />
          </div>
        ) : (
          <>
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl mb-4', bgColor)}>
              <div className={cn('h-5 w-5', color)}>{icon}</div>
            </div>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
              {trend !== undefined && (
                <span className={cn(
                  'flex items-center gap-0.5 text-xs font-medium',
                  trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500',
                )}>
                  {trend >= 0
                    ? <TrendingUp className="h-3 w-3" />
                    : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(trend)}% vs prev
                </span>
              )}
              {alert && (
                <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  High
                </Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

interface Props {
  metrics: EmailMetrics
  loading?: boolean
}

export function EmailMetricsCards({ metrics, loading }: Props) {
  const { totals } = metrics
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard
        icon={<Mail />}
        label="Emails sent"
        value={totals.sent.toLocaleString()}
        sub={`${totals.opened.toLocaleString()} opened`}
        color="text-blue-600 dark:text-blue-400"
        bgColor="bg-blue-50 dark:bg-blue-950/30"
        loading={loading}
      />
      <MetricCard
        icon={<Eye />}
        label="Open rate"
        value={`${totals.open_rate}%`}
        sub="Industry avg: 25%"
        trend={totals.open_rate >= 25 ? +(totals.open_rate - 25).toFixed(1) : -(25 - totals.open_rate).toFixed(1) as unknown as number}
        color={totals.open_rate >= 25 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-500'}
        bgColor={totals.open_rate >= 25 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-orange-50 dark:bg-orange-950/30'}
        loading={loading}
      />
      <MetricCard
        icon={<MessageSquare />}
        label="Reply rate"
        value={`${totals.reply_rate}%`}
        sub={`${totals.replied} replies`}
        trend={totals.reply_rate >= 5 ? +(totals.reply_rate - 5).toFixed(1) : -(5 - totals.reply_rate).toFixed(1) as unknown as number}
        color={totals.reply_rate >= 5 ? 'text-purple-600 dark:text-purple-400' : 'text-orange-500'}
        bgColor={totals.reply_rate >= 5 ? 'bg-purple-50 dark:bg-purple-950/30' : 'bg-orange-50 dark:bg-orange-950/30'}
        loading={loading}
      />
      <MetricCard
        icon={<AlertCircle />}
        label="Bounce rate"
        value={`${totals.bounce_rate}%`}
        sub={`${totals.bounced} bounced`}
        alert={totals.bounce_rate > 5}
        color={totals.bounce_rate > 5 ? 'text-red-500' : totals.bounce_rate > 2 ? 'text-orange-500' : 'text-emerald-600 dark:text-emerald-400'}
        bgColor={totals.bounce_rate > 5 ? 'bg-red-50 dark:bg-red-950/30' : totals.bounce_rate > 2 ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'}
        loading={loading}
      />
    </div>
  )
}

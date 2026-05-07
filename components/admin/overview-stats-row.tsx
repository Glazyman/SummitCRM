'use client'

/**
 * components/admin/overview-stats-row.tsx
 *
 * Six KPI cards spanning the full width of the dashboard.
 * Each card has: icon, label, value, trend indicator.
 */

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Mail, TrendingUp, MessageSquare, AlertCircle,
  Users, UserPlus, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OverviewTotals } from './types'

interface StatCardProps {
  icon:      React.ReactNode
  label:     string
  value:     string | number
  sub?:      string
  alert?:    boolean
  highlight?: 'green' | 'orange' | 'red' | 'blue' | 'purple'
  loading?:  boolean
}

function StatCard({ icon, label, value, sub, alert, highlight, loading }: StatCardProps) {
  const colorMap = {
    green:  'text-emerald-600 dark:text-emerald-400',
    orange: 'text-orange-500 dark:text-orange-400',
    red:    'text-red-500 dark:text-red-400',
    blue:   'text-blue-600 dark:text-blue-400',
    purple: 'text-purple-600 dark:text-purple-400',
  }
  const bgMap = {
    green:  'bg-emerald-50 dark:bg-emerald-950/30',
    orange: 'bg-orange-50 dark:bg-orange-950/30',
    red:    'bg-red-50 dark:bg-red-950/30',
    blue:   'bg-blue-50 dark:bg-blue-950/30',
    purple: 'bg-purple-50 dark:bg-purple-950/30',
  }

  return (
    <Card className={cn(
      'relative overflow-hidden transition-shadow hover:shadow-md',
      alert && 'border-orange-300 dark:border-orange-700',
    )}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            highlight ? bgMap[highlight] : 'bg-muted',
          )}>
            <div className={cn('h-5 w-5', highlight ? colorMap[highlight] : 'text-muted-foreground')}>
              {icon}
            </div>
          </div>
          {alert && (
            <Badge variant="secondary" className="text-xs border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-950/30">
              Alert
            </Badge>
          )}
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-8 w-20 rounded bg-muted" />
              <div className="h-3 w-28 rounded bg-muted" />
            </div>
          ) : (
            <>
              <p className={cn(
                'text-2xl font-bold tracking-tight',
                highlight ? colorMap[highlight] : '',
              )}>
                {value}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
              {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface OverviewStatsRowProps {
  totals:           OverviewTotals
  activeCampaigns:  number
  loading?:         boolean
}

export function OverviewStatsRow({ totals, activeCampaigns, loading }: OverviewStatsRowProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <StatCard
        icon={<Mail />}
        label="Emails sent"
        value={totals.emails_sent.toLocaleString()}
        highlight="blue"
        loading={loading}
      />
      <StatCard
        icon={<TrendingUp />}
        label="Open rate"
        value={`${totals.open_rate}%`}
        highlight={totals.open_rate >= 25 ? 'green' : totals.open_rate >= 15 ? 'orange' : 'red'}
        sub={totals.open_rate >= 25 ? 'Above benchmark' : 'Below 25% benchmark'}
        loading={loading}
      />
      <StatCard
        icon={<MessageSquare />}
        label="Reply rate"
        value={`${totals.reply_rate}%`}
        highlight={totals.reply_rate >= 5 ? 'green' : 'orange'}
        loading={loading}
      />
      <StatCard
        icon={<AlertCircle />}
        label="Bounce rate"
        value={`${totals.bounce_rate}%`}
        highlight={totals.bounce_rate > 5 ? 'red' : totals.bounce_rate > 2 ? 'orange' : 'green'}
        alert={totals.bounce_rate > 5}
        sub={totals.bounce_rate > 5 ? 'High — review accounts' : undefined}
        loading={loading}
      />
      <StatCard
        icon={<Users />}
        label="Active leads"
        value={totals.active_leads.toLocaleString()}
        sub={`+${totals.new_leads_period} this period`}
        highlight="purple"
        loading={loading}
      />
      <StatCard
        icon={<Zap />}
        label="Active campaigns"
        value={activeCampaigns}
        highlight={activeCampaigns > 0 ? 'green' : undefined}
        loading={loading}
      />
    </div>
  )
}

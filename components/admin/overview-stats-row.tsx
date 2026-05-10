'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp, Users, Phone, PhoneCall, UserX, Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OverviewTotals } from './types'

interface StatCardProps {
  icon:       React.ReactNode
  label:      string
  value:      string | number
  sub?:       string
  alert?:     boolean
  highlight?: 'green' | 'orange' | 'red' | 'blue' | 'purple'
  loading?:   boolean
}

function StatCard({ icon, label, value, sub, alert, highlight, loading }: StatCardProps) {
  return (
    <Card className={cn(
      'relative overflow-hidden transition-shadow hover:shadow-card',
      alert && 'border-foreground/30',
    )}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            highlight ? 'border border-border bg-secondary' : 'bg-muted',
          )}>
            <div className={cn('h-5 w-5', highlight ? 'text-foreground' : 'text-muted-foreground')}>
              {icon}
            </div>
          </div>
          {alert && (
            <Badge variant="secondary" className="text-xs">Alert</Badge>
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
              <p className={cn('text-2xl font-bold tracking-tight', highlight ? 'text-foreground' : '')}>
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
  totals:          OverviewTotals
  activeCampaigns: number
  loading?:        boolean
}

export function OverviewStatsRow({ totals, loading }: OverviewStatsRowProps) {
  const conversionRate = totals.leads_contacted > 0
    ? Math.round((totals.interested_leads / totals.leads_contacted) * 100)
    : 0

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <StatCard
        icon={<Users />}
        label="Total leads"
        value={totals.active_leads.toLocaleString()}
        sub={`+${totals.new_leads_period} new this period`}
        highlight="blue"
        loading={loading}
      />
      <StatCard
        icon={<TrendingUp />}
        label="Interested"
        value={totals.interested_leads.toLocaleString()}
        sub="expressed interest"
        highlight={totals.interested_leads > 0 ? 'green' : undefined}
        loading={loading}
      />
      <StatCard
        icon={<Phone />}
        label="Contacted"
        value={totals.leads_contacted.toLocaleString()}
        sub="leads reached"
        loading={loading}
      />
      <StatCard
        icon={<PhoneCall />}
        label="Calls logged"
        value={totals.calls_period.toLocaleString()}
        sub="this period"
        highlight="purple"
        loading={loading}
      />
      <StatCard
        icon={<Target />}
        label="Conversion rate"
        value={`${conversionRate}%`}
        sub="interested / contacted"
        highlight={conversionRate >= 10 ? 'green' : conversionRate >= 5 ? 'orange' : undefined}
        loading={loading}
      />
      <StatCard
        icon={<UserX />}
        label="Unassigned"
        value={totals.unassigned_leads.toLocaleString()}
        sub="need a rep"
        alert={totals.unassigned_leads > 0}
        loading={loading}
      />
    </div>
  )
}

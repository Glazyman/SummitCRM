'use client'

/**
 * components/admin/ai-usage-widget.tsx
 *
 * Compact AI token budget card for the admin dashboard.
 * Shows: tokens used, cost, budget progress bar.
 * "View Details" → /settings/ai-usage
 */

import React from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }    from '@/components/ui/badge'
import { Button }   from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Sparkles, ArrowRight, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiUsageSummary } from './types'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface AiUsageWidgetProps {
  usage:    AiUsageSummary
  loading?: boolean
}

export function AiUsageWidget({ usage, loading }: AiUsageWidgetProps) {
  const pct    = usage.budget_used_pct
  const isWarn = pct >= 80
  const isCrit = pct >= 100

  return (
    <Card className={cn(isCrit && 'border-red-300 dark:border-red-700')}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-5 w-5 text-purple-500" />
          AI usage
          <span className="ml-auto">
            {isCrit ? (
              <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-300">
                Budget reached
              </Badge>
            ) : isWarn ? (
              <Badge className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-300">
                {pct}% used
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">{pct}% used</Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-6 w-24 rounded bg-muted" />
            <div className="h-2 w-full rounded bg-muted" />
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold">{formatTokens(usage.total_tokens)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  tokens this month · {usage.total_calls.toLocaleString()} calls
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold">${usage.total_cost_usd.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">estimated cost</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Progress
                value={Math.min(pct, 100)}
                className={cn(
                  'h-2.5',
                  isCrit  ? '[&>div]:bg-red-500'    :
                  isWarn  ? '[&>div]:bg-orange-500'  : '',
                )}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatTokens(usage.total_tokens)} used</span>
                <span>{formatTokens(usage.budget)} budget</span>
              </div>
            </div>

            {isWarn && (
              <div className={cn(
                'flex items-start gap-2 rounded-md p-2.5 text-xs',
                isCrit
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                  : 'bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300',
              )}>
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {isCrit
                  ? 'Budget reached. AI features are paused. Upgrade or wait until next month.'
                  : 'Approaching budget limit. Review usage or increase the monthly token budget.'}
              </div>
            )}

            <Button asChild variant="outline" size="sm" className="w-full gap-2">
              <Link href="/settings/ai-usage">
                View details <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

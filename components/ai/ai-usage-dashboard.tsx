'use client'

/**
 * components/ai/ai-usage-dashboard.tsx
 *
 * AIUsageDashboard — admin-only view showing token usage, costs,
 * model/task breakdown, and daily trend chart.
 *
 * Data source: GET /api/ai/usage
 */

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }    from '@/components/ui/badge'
import { Button }   from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Sparkles, TrendingUp, DollarSign, Zap,
  RefreshCw, AlertCircle, Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface UsageSummary {
  total_tokens:    number
  total_cost_usd:  number
  total_calls:     number
  budget:          number
  budget_used_pct: number
  by_model:        Array<{ model: string; tokens: number; cost: number; calls: number }>
  by_task:         Array<{ task:  string; tokens: number; cost: number; calls: number }>
  by_day:          Array<{ date:  string; tokens: number; cost: number }>
}

const TASK_LABELS: Record<string, string> = {
  email_draft:  'Email Drafts',
  subject_line: 'Subject Lines',
  follow_up:    'Follow-ups',
  lead_summary: 'Lead Summaries',
  batch_email:  'Batch Emails',
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function exportCsv(data: UsageSummary) {
  const rows = [
    ['Date', 'Tokens', 'Cost (USD)'],
    ...data.by_day.map((d) => [d.date, String(d.tokens), d.cost.toFixed(6)]),
  ]
  const csv  = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `ai-usage-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AIUsageDashboard() {
  const [data,    setData]    = useState<UsageSummary | null>(null)
  const [months,  setMonths]  = useState(1)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const load = async (m: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/usage?months=${m}`)
      if (!res.ok) {
        const err = await res.json()
        setError(err.error ?? 'Failed to load usage data')
        return
      }
      setData(await res.json())
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(months) }, [months])

  if (error) {
    return (
      <div className="flex items-center gap-2 p-6 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <span>{error}</span>
      </div>
    )
  }

  const budgetPct = data?.budget_used_pct ?? 0
  const maxDayTokens = data ? Math.max(...data.by_day.map((d) => d.tokens), 1) : 1

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-foreground" />
            AI Usage
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Token consumption and estimated costs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month selector */}
          <div className="flex rounded-lg border overflow-hidden">
            {[1, 3, 6].map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  months === m
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground',
                )}
              >
                {m}M
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(months)}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
          {data && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCsv(data)}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {data && (
        <>
          {/* ── Summary cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> Total Tokens
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatTokens(data.total_tokens)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">last {months} month{months > 1 ? 's' : ''}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" /> Est. Cost
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">${data.total_cost_usd.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{data.total_calls.toLocaleString()} calls</p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Monthly Budget
                  <Badge
                    variant={budgetPct >= 100 ? 'destructive' : budgetPct >= 80 ? 'secondary' : 'outline'}
                    className="text-xs ml-auto"
                  >
                    {budgetPct}%
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Progress
                  value={Math.min(budgetPct, 100)}
                  className={cn(
                    'h-3',
                    budgetPct >= 100 ? '[&>div]:bg-foreground' : budgetPct >= 80 ? '[&>div]:bg-foreground' : '',
                  )}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  {formatTokens(data.total_tokens)} / {formatTokens(data.budget)} tokens used this month
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Daily chart ────────────────────────────────────────────── */}
          {data.by_day.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Daily Token Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-28 overflow-x-auto pb-2">
                  {data.by_day.slice(-30).map((d) => {
                    const pct = Math.round((d.tokens / maxDayTokens) * 100)
                    return (
                      <div key={d.date} className="flex flex-col items-center gap-1 group min-w-[20px]">
                        <div className="relative flex-1 flex items-end w-4">
                          <div
                            className="w-full bg-secondary rounded-sm group-hover:bg-secondary transition-colors"
                            style={{ height: `${Math.max(pct, 4)}%` }}
                            title={`${d.date}: ${formatTokens(d.tokens)} tokens ($${d.cost.toFixed(4)})`}
                          />
                        </div>
                        {data.by_day.length <= 14 && (
                          <span className="text-[9px] text-muted-foreground rotate-45 origin-left w-8 overflow-hidden whitespace-nowrap">
                            {d.date.slice(5)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── By model + by task ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By model */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">By Model</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.by_model.length === 0 && (
                    <p className="text-sm text-muted-foreground">No data</p>
                  )}
                  {data.by_model.map((m) => (
                    <div key={m.model} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium font-mono text-xs">{m.model}</span>
                        <span className="text-muted-foreground">
                          {formatTokens(m.tokens)} · ${m.cost.toFixed(4)} · {m.calls} calls
                        </span>
                      </div>
                      <Progress
                        value={Math.round((m.tokens / Math.max(data.total_tokens, 1)) * 100)}
                        className="h-1.5"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* By task */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">By Task</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.by_task.length === 0 && (
                    <p className="text-sm text-muted-foreground">No data</p>
                  )}
                  {data.by_task.map((t) => (
                    <div key={t.task} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {TASK_LABELS[t.task] ?? t.task}
                        </span>
                        <span className="text-muted-foreground">
                          {formatTokens(t.tokens)} · {t.calls} calls
                        </span>
                      </div>
                      <Progress
                        value={Math.round((t.tokens / Math.max(data.total_tokens, 1)) * 100)}
                        className="h-1.5"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

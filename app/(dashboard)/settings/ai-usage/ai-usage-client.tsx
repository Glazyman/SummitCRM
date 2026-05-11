'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw } from 'lucide-react'
import type { UsageSummary, UsageRow } from '@/lib/ai'

function fmtUsd(n: number): string {
  if (n < 0.01)  return `$${n.toFixed(4)}`
  if (n < 1)     return `$${n.toFixed(3)}`
  return `$${n.toFixed(2)}`
}
function fmtInt(n: number): string {
  return n.toLocaleString()
}
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function AiUsageClient() {
  const [data,    setData]    = React.useState<UsageSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error,   setError]   = React.useState<string | null>(null)

  // Effect drives the initial fetch; `load` reuses the same logic for the
  // Refresh button without re-triggering on every parent render.
  React.useEffect(() => {
    let cancelled = false
    fetch('/api/admin/ai-usage', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`)
        const json = await res.json()
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ai-usage', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Status ${res.status}`)
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const avgCost = data && data.month_total_calls > 0
    ? data.month_total_usd / data.month_total_calls
    : 0

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Month to date"    value={loading ? '…' : fmtUsd(data?.month_total_usd ?? 0)} sub="USD" />
        <Stat label="Total emails sent" value={loading ? '…' : fmtInt(data?.month_total_calls ?? 0)} sub="this month" />
        <Stat label="Avg per email"    value={loading ? '…' : fmtUsd(avgCost)} sub="USD" />
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Recent calls */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm font-semibold">Recent snapshot generations</CardTitle>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !data || data.recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No snapshot emails generated yet.</p>
          ) : (
            <UsageTable rows={data.recent} />
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cost is calculated from OpenAI list pricing for gpt-4o: $2.50/M input tokens, $10.00/M output tokens.
      </p>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function UsageTable({ rows }: { rows: UsageRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2">When</th>
            <th className="px-2 py-2">Who</th>
            <th className="px-2 py-2">Lead</th>
            <th className="px-2 py-2 text-right">Tokens (in / out)</th>
            <th className="px-2 py-2 text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/60 last:border-0">
              <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(r.created_at)}</td>
              <td className="px-2 py-2 truncate max-w-[160px]">{r.user_name ?? r.user_id.slice(0, 8)}</td>
              <td className="px-2 py-2 truncate max-w-[200px]">{r.lead_company ?? '—'}</td>
              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                {fmtInt(r.prompt_tokens)} / {fmtInt(r.completion_tokens)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-medium">{fmtUsd(r.cost_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

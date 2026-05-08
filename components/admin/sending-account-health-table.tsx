'use client'

/**
 * components/admin/sending-account-health-table.tsx
 *
 * Sending account quota + bounce/failure health table.
 * Red: quota > 80% or bounce_7d > 5
 * Orange: quota 60–80% or bounce_7d 2–5
 * Pause button for admins only.
 */

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }    from '@/components/ui/badge'
import { Button }   from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Server, Pause, AlertTriangle, CheckCircle2, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SendingAccountHealth } from './types'

interface Props {
  accounts:  SendingAccountHealth[]
  isAdmin:   boolean
  loading?:  boolean
}

function quotaColor(pct: number) {
  if (pct >= 80) return { bar: '[&>div]:bg-foreground',    text: 'text-foreground',    badge: 'bg-secondary text-foreground' }
  if (pct >= 60) return { bar: '[&>div]:bg-foreground', text: 'text-foreground',                   badge: 'bg-secondary text-foreground' }
  return           { bar: '',                            text: 'text-foreground',                   badge: 'bg-secondary text-foreground' }
}

function bounceLevel(n: number): 'ok' | 'warn' | 'danger' {
  if (n >= 5) return 'danger'
  if (n >= 2) return 'warn'
  return 'ok'
}

export function SendingAccountHealthTable({ accounts, isAdmin, loading }: Props) {
  const [pausing, setPausing] = useState<Set<string>>(new Set())

  const handlePause = async (id: string) => {
    setPausing((p) => new Set([...p, id]))
    try {
      await fetch(`/api/sending-accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_active: false }),
      })
    } finally {
      setPausing((p) => { const n = new Set(p); n.delete(id); return n })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="h-5 w-5 text-foreground" />
          Sending account health
          <Badge variant="secondary" className="ml-auto text-xs">{accounts.length} accounts</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Account</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Daily quota</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Bounces (7d)</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Failures (7d)</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                {isAdmin && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  {Array.from({ length: isAdmin ? 7 : 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 w-24 rounded bg-muted" /></td>
                  ))}
                </tr>
              ))}
              {!loading && accounts.map((acct) => {
                const qc     = quotaColor(acct.quota_pct)
                const bounce = bounceLevel(acct.bounces_7d)
                const isWarn = acct.quota_pct >= 80 || bounce === 'danger'

                return (
                  <tr
                    key={acct.id}
                    className={cn(
                      'border-b last:border-0 transition-colors',
                      isWarn ? 'bg-secondary hover:bg-secondary' : 'hover:bg-muted/30',
                    )}
                  >
                    {/* Account */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{acct.name}</p>
                        <p className="text-xs text-muted-foreground">{acct.from_email}</p>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {acct.type === 'resend' ? (
                          <><Wifi className="h-2.5 w-2.5 mr-1" />Resend</>
                        ) : (
                          <><Server className="h-2.5 w-2.5 mr-1" />SMTP</>
                        )}
                      </Badge>
                    </td>

                    {/* Quota */}
                    <td className="px-4 py-3 min-w-[160px]">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className={cn('text-xs font-medium', qc.text)}>
                            {acct.emails_sent_today} / {acct.daily_limit}
                          </span>
                          <span className={cn('text-xs font-semibold', qc.text)}>
                            {acct.quota_pct}%
                          </span>
                        </div>
                        <Progress
                          value={Math.min(acct.quota_pct, 100)}
                          className={cn('h-2', qc.bar)}
                        />
                      </div>
                    </td>

                    {/* Bounces */}
                    <td className="px-4 py-3">
                      <span className={cn(
                        'font-semibold',
                        bounce === 'danger' ? 'text-foreground' :
                        bounce === 'warn'   ? 'text-foreground' : '',
                      )}>
                        {acct.bounces_7d}
                        {bounce !== 'ok' && (
                          <AlertTriangle className="inline ml-1 h-3.5 w-3.5" />
                        )}
                      </span>
                    </td>

                    {/* Failures */}
                    <td className="px-4 py-3">
                      <span className={cn(
                        'font-semibold',
                        acct.failures_7d > 3 ? 'text-foreground' :
                        acct.failures_7d > 1 ? 'text-foreground' : '',
                      )}>
                        {acct.failures_7d}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {acct.is_active ? (
                        <span className="flex items-center gap-1.5 text-foreground text-xs font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Pause className="h-3.5 w-3.5" />
                          Paused
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    {isAdmin && (
                      <td className="px-4 py-3">
                        {acct.is_active && isWarn && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePause(acct.id)}
                            disabled={pausing.has(acct.id)}
                            className="h-7 px-2 text-xs gap-1 border-border text-foreground hover:bg-secondary"
                          >
                            <Pause className="h-3 w-3" />
                            {pausing.has(acct.id) ? 'Pausing…' : 'Pause'}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
              {!loading && accounts.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No sending accounts configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

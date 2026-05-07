'use client'

/**
 * components/admin/team-performance-table.tsx
 *
 * Sortable table showing per-rep email performance.
 * Columns: Name, Role, Sent, Open Rate, Reply Rate, Replies, Last Active
 */

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }    from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Users, ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RepStat } from './types'

type SortField = 'full_name' | 'emails_sent' | 'open_rate' | 'reply_rate' | 'emails_replied'
type SortDir   = 'asc' | 'desc'

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(' ')
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')
  }
  return email[0]?.toUpperCase() ?? '?'
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  admin:       'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  manager:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  rep:         'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  viewer:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

function SortIcon({ field, sort }: { field: SortField; sort: { field: SortField; dir: SortDir } }) {
  if (sort.field !== field) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
  return sort.dir === 'asc'
    ? <ChevronUp   className="h-3.5 w-3.5 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 text-primary" />
}

interface TeamPerformanceTableProps {
  stats:    RepStat[]
  loading?: boolean
}

export function TeamPerformanceTable({ stats, loading }: TeamPerformanceTableProps) {
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: 'emails_sent',
    dir:   'desc',
  })

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => {
      const va = a[sort.field] ?? ''
      const vb = b[sort.field] ?? ''
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [stats, sort])

  const toggleSort = (field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'desc' },
    )
  }

  const maxSent = Math.max(...stats.map((s) => s.emails_sent), 1)

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-blue-500" />
          Team performance
          <Badge variant="secondary" className="ml-auto text-xs">{stats.length} members</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {([
                  { key: 'full_name',      label: 'Rep'           },
                  { key: 'emails_sent',    label: 'Sent'          },
                  { key: 'open_rate',      label: 'Open rate'     },
                  { key: 'reply_rate',     label: 'Reply rate'    },
                  { key: 'emails_replied', label: 'Replies'       },
                ] as { key: SortField; label: string }[]).map(({ key, label }) => (
                  <th
                    key={key}
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
                    onClick={() => toggleSort(key)}
                  >
                    <div className="flex items-center gap-1.5">
                      {label}
                      <SortIcon field={key} sort={sort} />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                  Last active
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 w-32 rounded bg-muted" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-muted" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 rounded bg-muted" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-20 rounded bg-muted" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-12 rounded bg-muted" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-muted" /></td>
                </tr>
              ))}
              {!loading && sorted.map((rep) => {
                const pct = Math.round((rep.emails_sent / maxSent) * 100)
                return (
                  <tr
                    key={rep.user_id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    {/* Rep name + avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0">
                          {initials(rep.full_name, rep.user_email)}
                        </div>
                        <div>
                          <p className="font-medium leading-tight">{rep.full_name ?? rep.user_email}</p>
                          {rep.full_name && (
                            <p className="text-xs text-muted-foreground">{rep.user_email}</p>
                          )}
                        </div>
                        <Badge className={cn('text-xs ml-1', ROLE_COLORS[rep.role] ?? ROLE_COLORS.rep)}>
                          {rep.role}
                        </Badge>
                      </div>
                    </td>

                    {/* Emails sent with micro bar */}
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <span className="font-semibold">{rep.emails_sent.toLocaleString()}</span>
                        <Progress value={pct} className="h-1 w-24" />
                      </div>
                    </td>

                    {/* Open rate */}
                    <td className="px-4 py-3">
                      <span className={cn(
                        'font-semibold',
                        rep.open_rate >= 30 ? 'text-emerald-600 dark:text-emerald-400' :
                        rep.open_rate >= 20 ? '' :
                        'text-orange-500',
                      )}>
                        {rep.open_rate}%
                      </span>
                    </td>

                    {/* Reply rate */}
                    <td className="px-4 py-3">
                      <span className={cn(
                        'font-semibold',
                        rep.reply_rate >= 6 ? 'text-emerald-600 dark:text-emerald-400' :
                        rep.reply_rate >= 3 ? '' :
                        'text-orange-500',
                      )}>
                        {rep.reply_rate}%
                      </span>
                    </td>

                    {/* Replies count */}
                    <td className="px-4 py-3 font-medium">
                      {rep.emails_replied}
                    </td>

                    {/* Last active */}
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {relativeTime(rep.last_active)}
                    </td>
                  </tr>
                )
              })}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No team members found
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

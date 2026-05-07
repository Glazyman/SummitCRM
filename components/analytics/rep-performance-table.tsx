'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }    from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Users, ChevronUp, ChevronDown, ChevronsUpDown, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RepRow } from './types'

type SortKey = 'emails_sent' | 'open_rate' | 'reply_rate' | 'bounce_rate' | 'leads_assigned'

const ROLE_BADGE: Record<string, string> = {
  admin:       'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  super_admin: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  manager:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  rep:         'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

function initials(name: string | null, email: string) {
  if (name) { const p = name.split(' '); return (p[0]?.[0] ?? '') + (p[1]?.[0] ?? '') }
  return email[0]?.toUpperCase() ?? '?'
}

const AVATAR_BG = ['bg-blue-500','bg-purple-500','bg-emerald-500','bg-orange-500','bg-pink-500','bg-teal-500']
function avatarBg(id: string) {
  let h = 0; for (const c of id) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length]
}

interface Props { reps: RepRow[]; loading?: boolean }

export function RepPerformanceTable({ reps, loading }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'emails_sent', dir: 'desc' })
  const sorted = useMemo(() =>
    [...reps].sort((a, b) => {
      const d = sort.dir === 'asc' ? 1 : -1
      return (a[sort.key] > b[sort.key] ? 1 : -1) * d
    }), [reps, sort])

  const onSort = (key: SortKey) =>
    setSort(p => ({ key, dir: p.key === key && p.dir === 'desc' ? 'asc' : 'desc' }))

  const maxSent = Math.max(...reps.map(r => r.emails_sent), 1)

  const cols: Array<{ key: SortKey; label: string }> = [
    { key: 'emails_sent',    label: 'Sent'           },
    { key: 'open_rate',      label: 'Open rate'      },
    { key: 'reply_rate',     label: 'Reply rate'     },
    { key: 'bounce_rate',    label: 'Bounce rate'    },
    { key: 'leads_assigned', label: 'Leads assigned' },
  ]

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-blue-500" />
          Rep performance
          <Badge variant="secondary" className="ml-auto text-xs">{reps.length} reps</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8">#</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Rep</th>
                {cols.map(c => (
                  <th key={c.key} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                    <button onClick={() => onSort(c.key)} className="flex items-center gap-1 group hover:text-foreground">
                      {c.label}
                      {sort.key === c.key
                        ? sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />
                        : <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                      }
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 w-16 rounded bg-muted" /></td>
                  ))}
                </tr>
              ))}
              {!loading && sorted.map((rep, i) => {
                const isTop = i === 0 && rep.emails_sent > 0
                return (
                  <tr key={rep.user_id} className={cn(
                    'border-b last:border-0 transition-colors',
                    isTop ? 'bg-yellow-50/30 dark:bg-yellow-950/10 hover:bg-yellow-50/50' : 'hover:bg-muted/30',
                  )}>
                    <td className="px-4 py-3 text-muted-foreground font-medium">
                      {isTop ? <Trophy className="h-4 w-4 text-yellow-500" /> : i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn('flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold shrink-0', avatarBg(rep.user_id))}>
                          {initials(rep.full_name, rep.user_email)}
                        </div>
                        <div>
                          <p className="font-medium leading-tight">{rep.full_name ?? rep.user_email}</p>
                          <p className="text-xs text-muted-foreground">{rep.user_email}</p>
                        </div>
                        <Badge className={cn('text-xs shrink-0', ROLE_BADGE[rep.role] ?? ROLE_BADGE.rep)}>{rep.role}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <span className="font-semibold">{rep.emails_sent.toLocaleString()}</span>
                        <Progress value={Math.round((rep.emails_sent / maxSent) * 100)} className="h-1 w-20" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('font-semibold', rep.open_rate >= 28 ? 'text-emerald-600 dark:text-emerald-400' : rep.open_rate >= 18 ? '' : 'text-orange-500')}>
                        {rep.open_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('font-semibold', rep.reply_rate >= 5 ? 'text-emerald-600 dark:text-emerald-400' : rep.reply_rate >= 3 ? '' : 'text-orange-500')}>
                        {rep.reply_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('font-semibold', rep.bounce_rate > 3 ? 'text-red-500' : rep.bounce_rate > 1.5 ? 'text-orange-500' : '')}>
                        {rep.bounce_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{rep.leads_assigned.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

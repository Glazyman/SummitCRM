'use client'

import * as React from 'react'
import { ChevronDown, Key, Server, AlertTriangle, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SendingAccountPublic, QuotaStatus } from '@/lib/email/types'

interface AccountPickerProps {
  accounts:  SendingAccountPublic[]
  quotas:    Record<string, QuotaStatus>
  value:     string
  onChange:  (id: string) => void
  className?: string
}

export function AccountPicker({
  accounts, quotas, value, onChange, className,
}: AccountPickerProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  const selected = accounts.find((a) => a.id === value)
  const quota    = value ? quotas[value] : null

  // Close on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (accounts.length === 0) {
    return (
      <div className={cn(
        'flex items-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/10 dark:text-amber-400',
        className
      )}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>No sending accounts. <a href="/settings/sending-accounts" className="underline font-medium">Configure one →</a></span>
      </div>
    )
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors',
          'hover:bg-muted/40',
          open ? 'border-ring ring-2 ring-ring/20' : 'border-border'
        )}
      >
        {selected ? (
          <>
            {/* Type icon */}
            <div className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px]',
              selected.type === 'resend'
                ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
            )}>
              {selected.type === 'resend'
                ? <Key className="h-3 w-3" />
                : <Server className="h-3 w-3" />
              }
            </div>

            {/* Name + email */}
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate font-medium text-sm">{selected.from_name}</p>
              <p className="truncate text-xs text-muted-foreground">{selected.from_email}</p>
            </div>

            {/* Quota chip */}
            {quota && <QuotaMicroBadge quota={quota} />}
          </>
        ) : (
          <span className="text-muted-foreground">Select sending account…</span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <div className="p-1 space-y-0.5">
            {accounts.map((acct) => {
              const q      = quotas[acct.id]
              const isUsed = q?.at_limit
              return (
                <button
                  key={acct.id}
                  type="button"
                  onClick={() => { onChange(acct.id); setOpen(false) }}
                  disabled={isUsed}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                    acct.id === value
                      ? 'bg-primary/8 text-primary'
                      : isUsed
                        ? 'opacity-50 cursor-not-allowed text-muted-foreground'
                        : 'hover:bg-muted/60',
                  )}
                >
                  <div className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    acct.type === 'resend'
                      ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                      : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  )}>
                    {acct.type === 'resend'
                      ? <Key className="h-3.5 w-3.5" />
                      : <Server className="h-3.5 w-3.5" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{acct.from_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{acct.from_email}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    {q && <QuotaMicroBadge quota={q} />}
                    {isUsed && (
                      <span className="text-[9px] text-red-500">Resets midnight UTC</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="border-t border-border px-2 py-1.5">
            <a
              href="/settings/sending-accounts"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Manage sending accounts
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Micro quota badge ─────────────────────────────────────────────────────
function QuotaMicroBadge({ quota }: { quota: QuotaStatus }) {
  const { remaining, at_limit, percent_used } = quota
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full',
            at_limit ? 'bg-red-500' : percent_used >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
          )}
          style={{ width: `${Math.min(100, percent_used)}%` }}
        />
      </div>
      <span className={cn(
        'text-[10px] tabular-nums font-medium',
        at_limit ? 'text-red-500' : percent_used >= 80 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'
      )}>
        {at_limit ? 'Full' : `${remaining} left`}
      </span>
    </div>
  )
}

// ── Re-export QuotaStatus for consuming components ────────────────────────
export type { QuotaStatus }

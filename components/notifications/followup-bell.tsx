'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, BellOff, Phone, Calendar, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FollowUpItem {
  id:      string
  title:   string
  due_at:  string
  lead:    { id: string; first_name: string | null; last_name: string | null; company: string | null; phone: string | null } | null
}

interface DueData {
  overdue:  FollowUpItem[]
  dueToday: FollowUpItem[]
  count:    number
}

function leadName(lead: FollowUpItem['lead']): string {
  if (!lead) return 'Unknown'
  const n = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  return n || lead.company || 'Unknown'
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function FollowUpBell() {
  const [open,  setOpen]  = useState(false)
  const [data,  setData]  = useState<DueData | null>(null)
  const [shake, setShake] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const prevCount = useRef(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/activities/due')
      if (res.ok) {
        const json: DueData = await res.json()
        if (json.count > prevCount.current && prevCount.current >= 0) {
          setShake(true)
          setTimeout(() => setShake(false), 1000)
        }
        prevCount.current = json.count
        setData(json)
      }
    } catch { /* silent */ }
  }, [])

  // Load on mount, then every 5 minutes
  useEffect(() => {
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const count = data?.count ?? 0

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'relative flex items-center justify-center w-9 h-9 rounded-lg',
          'text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
          open && 'bg-muted text-foreground',
          shake && 'animate-bell-shake'
        )}
        aria-label={`Activities${count > 0 ? ` (${count} due)` : ''}`}
        aria-expanded={open}
      >
        <Bell className="w-[18px] h-[18px]" />
        {count > 0 && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1',
            'flex items-center justify-center rounded-full',
            'bg-primary text-primary-foreground text-[10px] font-bold leading-none',
            'ring-2 ring-background'
          )}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className={cn(
          'absolute right-0 top-full mt-2 z-50',
          'w-[360px] max-w-[calc(100vw-2rem)]',
          'rounded-xl border bg-popover shadow-card',
          'flex flex-col overflow-hidden',
          'animate-dropdown-in'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              <span className="font-semibold text-sm">Today's Activities</span>
              {count > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                  {count}
                </span>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto max-h-[420px]">
            {count === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <BellOff className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">All clear!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">No follow-ups due today</p>
                </div>
              </div>
            ) : (
              <div className="p-1.5 space-y-1">
                {/* Overdue */}
                {(data?.overdue?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Overdue
                    </p>
                    {data!.overdue.map((item) => (
                      <FollowUpRow key={item.id} item={item} overdue onClose={() => setOpen(false)} />
                    ))}
                  </div>
                )}

                {/* Due today */}
                {(data?.dueToday?.length ?? 0) > 0 && (
                  <div>
                    <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Due Today
                    </p>
                    {data!.dueToday.map((item) => (
                      <FollowUpRow key={item.id} item={item} onClose={() => setOpen(false)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-2.5">
            <Link
              href="/activities"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-primary hover:underline font-medium"
            >
              View all activities →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function FollowUpRow({ item, overdue, onClose }: { item: FollowUpItem; overdue?: boolean; onClose: () => void }) {
  const name = leadName(item.lead)
  return (
    <Link
      href={`/leads/${item.lead?.id ?? ''}`}
      onClick={onClose}
      className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted transition-colors"
    >
      <div className={cn(
        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        overdue ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
      )}>
        <Phone className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{item.title}</p>
        {item.lead?.company && (
          <p className="text-xs text-muted-foreground truncate">{item.lead.company}</p>
        )}
      </div>
      <span className={cn(
        'shrink-0 text-[10px] font-medium mt-0.5',
        overdue ? 'text-destructive' : 'text-muted-foreground'
      )}>
        {overdue ? new Date(item.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : timeLabel(item.due_at)}
      </span>
    </Link>
  )
}

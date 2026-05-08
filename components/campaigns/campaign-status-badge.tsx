import * as React from 'react'
import {
  Circle, Clock, Play, Pause, CheckCircle2, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CampaignStatus } from './types'

interface StatusConfig {
  label: string
  icon:  React.ComponentType<{ className?: string }>
  badge: string
  dot:   string
}

const STATUS_CONFIG: Record<CampaignStatus, StatusConfig> = {
  draft:     { label: 'Draft',     icon: Circle,       badge: 'border-border bg-card text-muted-foreground', dot: 'bg-muted-foreground/50' },
  scheduled: { label: 'Scheduled', icon: Clock,        badge: 'border-border bg-secondary text-foreground',  dot: 'bg-foreground/50' },
  running:   { label: 'Running',   icon: Play,         badge: 'border-border bg-primary text-primary-foreground', dot: 'bg-primary-foreground' },
  paused:    { label: 'Paused',    icon: Pause,        badge: 'border-border bg-secondary text-foreground', dot: 'bg-foreground/50' },
  completed: { label: 'Completed', icon: CheckCircle2, badge: 'border-border bg-card text-foreground', dot: 'bg-foreground/60' },
  cancelled: { label: 'Cancelled', icon: XCircle,      badge: 'border-border bg-secondary text-foreground', dot: 'bg-foreground/50' },
}

interface CampaignStatusBadgeProps {
  status: CampaignStatus
  size?:  'sm' | 'md'
  dot?:   boolean   // show pulsing dot instead of icon
}

export function CampaignStatusBadge({ status, size = 'md', dot = false }: CampaignStatusBadgeProps) {
  const cfg  = STATUS_CONFIG[status]
  const Icon = cfg.icon

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border font-medium',
      size === 'sm' ? 'px-2 py-px text-[10px]' : 'px-2.5 py-0.5 text-xs',
      cfg.badge
    )}>
      {dot ? (
        <span className={cn(
          'h-1.5 w-1.5 rounded-full',
          cfg.dot,
          status === 'running' && 'animate-pulse'
        )} />
      ) : (
        <Icon className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      )}
      {cfg.label}
    </span>
  )
}

/** Just the dot indicator (used inline in tables) */
export function StatusDot({ status }: { status: CampaignStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={cn(
      'inline-block h-2 w-2 rounded-full',
      cfg.dot,
      status === 'running' && 'animate-pulse'
    )} />
  )
}

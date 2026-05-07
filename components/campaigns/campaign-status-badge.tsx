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
  draft:     { label: 'Draft',     icon: Circle,       badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',     dot: 'bg-gray-400'    },
  scheduled: { label: 'Scheduled', icon: Clock,        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',  dot: 'bg-blue-500'    },
  running:   { label: 'Running',   icon: Play,         badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', dot: 'bg-green-500' },
  paused:    { label: 'Paused',    icon: Pause,        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', dot: 'bg-amber-500' },
  completed: { label: 'Completed', icon: CheckCircle2, badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',     dot: 'bg-gray-400'    },
  cancelled: { label: 'Cancelled', icon: XCircle,      badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',     dot: 'bg-red-500'     },
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
      'inline-flex items-center gap-1 rounded-full font-medium',
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

'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TagBadgeProps {
  name:       string
  color:      string
  onRemove?:  () => void
  size?:      'sm' | 'xs'
}

export function TagBadge({ name, color, onRemove, size = 'sm' }: TagBadgeProps) {
  // Convert hex color to a translucent bg using opacity
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs'
      )}
      style={{
        backgroundColor: `${color}22`,
        borderColor:      `${color}55`,
        color,
      }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="hover:opacity-70 transition-opacity flex-shrink-0"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  )
}

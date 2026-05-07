'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  delayMs?: number
}

/**
 * Lightweight hover tooltip.
 * Wraps a single child element and shows a label on hover/focus.
 * No portal — positioned with CSS. Suitable for table cells / small icons.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  delayMs = 400,
}: TooltipProps) {
  const [visible, setVisible] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function show() {
    timer.current = setTimeout(() => setVisible(true), delayMs)
  }
  function hide() {
    clearTimeout(timer.current)
    setVisible(false)
  }

  const sideClasses: Record<typeof side, string> = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md',
            'border border-border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-md',
            sideClasses[side],
            className
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}

'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Show indeterminate state (partially checked — e.g. "select all" with some selected) */
  indeterminate?: boolean
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, checked, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    const ref = (forwardedRef ?? innerRef) as React.RefObject<HTMLInputElement>

    React.useEffect(() => {
      if (ref.current) {
        ref.current.indeterminate = indeterminate ?? false
      }
    }, [indeterminate, ref])

    return (
      <span className={cn('relative inline-flex h-4 w-4 shrink-0 items-center justify-center', className)}>
        {/* Hidden native input — handles all a11y / keyboard / form semantics */}
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...props}
        />

        {/* Custom visual */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none flex h-4 w-4 items-center justify-center rounded border transition-colors',
            checked || indeterminate
              ? 'border-border bg-muted'
              : 'border-border/50 bg-background',
          )}
        >
          {/* Indeterminate dash */}
          {indeterminate && !checked && (
            <span className="h-px w-2 rounded-full bg-foreground/60" />
          )}

          {/* Checkmark */}
          {checked && (
            <svg
              className="h-2.5 w-2.5 text-foreground/75"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1.5 5l2.5 2.5 4.5-4.5" />
            </svg>
          )}
        </span>
      </span>
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }

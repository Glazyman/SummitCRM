'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
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
        {/* Hidden native input */}
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...props}
        />

        {/* Square box visual */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none flex h-4 w-4 items-center justify-center rounded-sm border-2 transition-colors',
            checked || indeterminate
              ? 'border-foreground bg-foreground'
              : 'border-border bg-background',
          )}
        >
          {/* Indeterminate dash */}
          {indeterminate && !checked && (
            <span className="h-0.5 w-2.5 rounded-full bg-white" />
          )}

          {/* Checkmark — white on dark box */}
          {checked && (
            <svg
              className="h-3 w-3 text-white"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 6l3 3 5-5" />
            </svg>
          )}
        </span>
      </span>
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }

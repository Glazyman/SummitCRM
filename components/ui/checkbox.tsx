'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Show indeterminate state (partially checked — e.g. "select all" with some selected) */
  indeterminate?: boolean
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    const ref = (forwardedRef ?? innerRef) as React.RefObject<HTMLInputElement>

    React.useEffect(() => {
      if (ref.current) {
        ref.current.indeterminate = indeterminate ?? false
      }
    }, [indeterminate, ref])

    return (
      <input
        type="checkbox"
        ref={ref}
        className={cn(
          'h-4 w-4 shrink-0 rounded border border-input bg-background',
          'cursor-pointer accent-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 shadow-xs shadow-black/5 outline-none transition-[color,box-shadow]',
        'text-sm placeholder:text-muted-foreground',
        'focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export { Textarea }

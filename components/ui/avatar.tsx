import * as React from 'react'
import { cn, getInitials } from '@/lib/utils'

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null
  name?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
  xl: 'h-16 w-16 text-xl',
}

export function Avatar({ src, name, size = 'md', className, ...props }: AvatarProps) {
  const initials = getInitials(name)

  if (src) {
    return (
      <div
        className={cn('relative overflow-hidden rounded-full bg-muted', sizeClasses[size], className)}
        {...props}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name ?? 'Avatar'} className="h-full w-full object-cover" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex select-none items-center justify-center rounded-full border border-border bg-card font-semibold text-foreground',
        sizeClasses[size],
        className
      )}
      aria-label={name ?? undefined}
      {...props}
    >
      {initials}
    </div>
  )
}

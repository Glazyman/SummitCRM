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

// Deterministic color from name so the same user always gets the same colour
const PALETTE = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-indigo-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-cyan-500',
]

function avatarColor(name?: string | null): string {
  if (!name) return 'bg-primary'
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export function Avatar({ src, name, size = 'md', className, ...props }: AvatarProps) {
  const initials = getInitials(name)
  const color = avatarColor(name)

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
        'flex select-none items-center justify-center rounded-full font-semibold text-white',
        sizeClasses[size],
        color,
        className
      )}
      aria-label={name ?? undefined}
      {...props}
    >
      {initials}
    </div>
  )
}

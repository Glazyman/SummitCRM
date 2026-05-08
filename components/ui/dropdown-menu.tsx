'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// ── Context ────────────────────────────────────────────────────────────────
interface DropdownContextValue {
  open: boolean
  setOpen: (v: boolean) => void
}
const DropdownContext = React.createContext<DropdownContextValue>({
  open:    false,
  setOpen: () => {},
})

// ── Root ───────────────────────────────────────────────────────────────────
interface DropdownMenuProps {
  children: React.ReactNode
  /** Controlled open state — if omitted, dropdown manages its own state */
  open?: boolean
  onOpenChange?: (v: boolean) => void
}

function DropdownMenu({ children, open: controlledOpen, onOpenChange }: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open         = isControlled ? controlledOpen : internalOpen

  function setOpen(v: boolean) {
    if (!isControlled) setInternalOpen(v)
    onOpenChange?.(v)
  }

  // Close on outside click
  const containerRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  React.useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={containerRef} className="relative inline-block">
        {children}
      </div>
    </DropdownContext.Provider>
  )
}

// ── Trigger ────────────────────────────────────────────────────────────────
function DropdownMenuTrigger({
  children,
  asChild,
}: {
  children: React.ReactElement
  asChild?: boolean
}) {
  const { open, setOpen } = React.useContext(DropdownContext)

  if (asChild) {
    return React.cloneElement(children, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(children.props as any),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation()
        setOpen(!open)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(children.props as any).onClick?.(e)
      },
      'aria-expanded': open,
      'aria-haspopup': 'menu',
    })
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
      aria-expanded={open}
      aria-haspopup="menu"
    >
      {children}
    </button>
  )
}

// ── Content ────────────────────────────────────────────────────────────────
interface DropdownMenuContentProps {
  children: React.ReactNode
  className?: string
  align?: 'start' | 'end' | 'center'
  side?: 'bottom' | 'top'
  minWidth?: string
}

function DropdownMenuContent({
  children,
  className,
  align = 'start',
  side = 'bottom',
  minWidth = '160px',
}: DropdownMenuContentProps) {
  const { open } = React.useContext(DropdownContext)
  if (!open) return null

  const alignClass = {
    start:  'left-0',
    end:    'right-0',
    center: 'left-1/2 -translate-x-1/2',
  }[align]

  const sideClass = side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'

  return (
    <div
      role="menu"
      style={{ minWidth }}
      className={cn(
        'absolute z-50 rounded-xl border border-border bg-popover p-1 shadow-card',
        'animate-in fade-in-0 zoom-in-95 duration-100',
        sideClass,
        alignClass,
        className
      )}
    >
      {children}
    </div>
  )
}

// ── Item ───────────────────────────────────────────────────────────────────
interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  className?: string
  destructive?: boolean
  icon?: React.ReactNode
  shortcut?: string
}

function DropdownMenuItem({
  children,
  className,
  destructive,
  icon,
  shortcut,
  onClick,
  ...props
}: DropdownMenuItemProps) {
  const { setOpen } = React.useContext(DropdownContext)

  return (
    <button
      role="menuitem"
      type="button"
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm',
        'text-left transition-colors',
        destructive
          ? 'text-foreground hover:bg-secondary focus:bg-secondary'
          : 'text-foreground hover:bg-secondary focus:bg-secondary',
        'focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) setOpen(false)
      }}
      {...props}
    >
      {icon && <span className="shrink-0 opacity-60">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && (
        <kbd className="ml-auto text-xs text-muted-foreground">{shortcut}</kbd>
      )}
    </button>
  )
}

// ── Separator ─────────────────────────────────────────────────────────────
function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn('my-1 h-px bg-border', className)} />
}

// ── Label ─────────────────────────────────────────────────────────────────
function DropdownMenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-2.5 py-1 text-xs font-medium text-muted-foreground', className)}>
      {children}
    </div>
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
}

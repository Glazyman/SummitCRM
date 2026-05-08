'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

// ── Context ────────────────────────────────────────────────────────────────
interface DropdownContextValue {
  open:       boolean
  setOpen:    (v: boolean) => void
  anchorRef:  React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
}
const DropdownContext = React.createContext<DropdownContextValue | null>(null)

function useDropdownContext() {
  const ctx = React.useContext(DropdownContext)
  if (!ctx) throw new Error('Dropdown components must be used inside DropdownMenu')
  return ctx
}

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

  const setOpen = React.useCallback((v: boolean) => {
    if (!isControlled) setInternalOpen(v)
    onOpenChange?.(v)
  }, [isControlled, onOpenChange])

  const containerRef = React.useRef<HTMLDivElement>(null)
  const contentRef   = React.useRef<HTMLDivElement>(null)

  // Close on outside click (anchor + portaled menu are both "inside")
  React.useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      if (contentRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, setOpen])

  // Close on Escape
  React.useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, setOpen])

  const ctx = React.useMemo(
    () => ({ open, setOpen, anchorRef: containerRef, contentRef }),
    [open, setOpen]
  )

  return (
    <DropdownContext.Provider value={ctx}>
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
  const { open, setOpen } = useDropdownContext()

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

// ── Content (portaled + fixed: escapes overflow-hidden ancestors) ─────────
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
  const { open, anchorRef, contentRef } = useDropdownContext()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const updatePosition = React.useCallback(() => {
    const anchor = anchorRef.current
    const menu   = contentRef.current
    if (!anchor || !menu) return

    const anchorRect = anchor.getBoundingClientRect()
    const menuRect   = menu.getBoundingClientRect()
    const mw         = menuRect.width
    const mh         = menuRect.height
    const pad        = 8
    const gap        = 4

    let top: number
    if (side === 'top') {
      top = anchorRect.top - mh - gap
      if (top < pad) top = anchorRect.bottom + gap
    } else {
      top = anchorRect.bottom + gap
      if (top + mh > window.innerHeight - pad) {
        const above = anchorRect.top - mh - gap
        if (above >= pad) top = above
      }
    }

    let left: number
    if (align === 'end') {
      left = anchorRect.right - mw
    } else if (align === 'center') {
      left = anchorRect.left + anchorRect.width / 2 - mw / 2
    } else {
      left = anchorRect.left
    }
    left = Math.max(pad, Math.min(left, window.innerWidth - mw - pad))

    menu.style.top  = `${Math.round(top)}px`
    menu.style.left = `${Math.round(left)}px`
  }, [align, side, anchorRef, contentRef])

  React.useLayoutEffect(() => {
    if (!open || !mounted) return
    updatePosition()
    const menu = contentRef.current
    if (!menu) return

    const ro = new ResizeObserver(updatePosition)
    ro.observe(menu)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, mounted, updatePosition, contentRef])

  if (!open || !mounted) return null

  const menu = (
    <div
      ref={contentRef}
      role="menu"
      style={{
        position: 'fixed',
        top:      0,
        left:     0,
        minWidth,
        zIndex:   100,
      }}
      className={cn(
        'flex flex-col rounded-xl border border-border bg-popover shadow-card',
        'animate-in fade-in-0 zoom-in-95 duration-100',
        className
      )}
    >
      <div className="max-h-[min(24rem,calc(100dvh-1rem))] overflow-y-auto overscroll-contain p-1">
        {children}
      </div>
    </div>
  )

  return createPortal(menu, document.body)
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
  const { setOpen } = useDropdownContext()

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

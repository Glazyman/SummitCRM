'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Context ───────────────────────────────────────────────────────────────
interface DialogContextValue {
  open: boolean
  onClose: () => void
}
const DialogContext = React.createContext<DialogContextValue>({
  open: false,
  onClose: () => {},
})

// ── Root ──────────────────────────────────────────────────────────────────
interface DialogProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

export function Dialog({ open, onClose, children }: DialogProps) {
  // Close on Escape key
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <DialogContext.Provider value={{ open, onClose }}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        aria-hidden="true"
        onClick={onClose}
      />
      {children}
    </DialogContext.Provider>
  )
}

// ── Content ───────────────────────────────────────────────────────────────
interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const sizeMap = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-lg',
  xl:   'max-w-2xl',
  full: 'max-w-5xl',
}

export function DialogContent({ size = 'md', className, children, ...props }: DialogContentProps) {
  const { onClose } = React.useContext(DialogContext)
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
        'w-full rounded-2xl border border-border bg-card shadow-xl',
        'animate-in fade-in zoom-in-95 duration-150',
        'max-h-[90vh] overflow-y-auto',
        sizeMap[size],
        className
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Close dialog"
      >
        <X className="h-4 w-4" />
      </button>
      {children}
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 pt-6 pb-4', className)} {...props} />
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1.5 text-sm text-muted-foreground', className)} {...props} />
}

// ── Body ──────────────────────────────────────────────────────────────────
export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 pb-4', className)} {...props} />
}

// ── Footer ────────────────────────────────────────────────────────────────
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-3 border-t border-border px-6 py-4', className)}
      {...props}
    />
  )
}

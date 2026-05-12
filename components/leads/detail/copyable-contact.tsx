'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CopyableContactProps {
  value:    string
  /** Underlying mailto: or tel: href — still usable via Cmd/Ctrl+click. */
  href?:    string
  className?: string
}

/**
 * Renders contact text (email / phone) that copies to clipboard on
 * click. Shows a tiny "Copied" pill for ~1.4 s. Cmd/Ctrl + click still
 * follows the href (open mail app / dialer).
 *
 * Why not always open mail/dial? Reps mostly want to paste the address
 * into another tool — copying first is the more useful default.
 */
export function CopyableContact({ value, href, className }: CopyableContactProps) {
  const [copied, setCopied] = React.useState(false)
  const timerRef            = React.useRef<number | null>(null)

  React.useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  async function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Cmd/Ctrl + click → let the browser handle the href (open mail / dial).
    if (e.metaKey || e.ctrlKey) return
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Fallback: surface the value in case the clipboard API is blocked.
      window.prompt('Copy:', value)
    }
  }

  return (
    <a
      href={href ?? '#'}
      onClick={handleClick}
      className={cn(
        'group/copy inline-flex items-center gap-1.5 cursor-pointer break-all',
        className,
      )}
      title="Click to copy"
    >
      <span className="break-all">{value}</span>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 text-[10px] font-medium transition-all duration-150',
          copied
            ? 'opacity-100 text-emerald-600'
            : 'opacity-0 group-hover/copy:opacity-60 text-muted-foreground'
        )}
        aria-live="polite"
      >
        {copied ? (
          <>
            <Check className="h-2.5 w-2.5" /> Copied
          </>
        ) : (
          <Copy className="h-2.5 w-2.5" />
        )}
      </span>
    </a>
  )
}

'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  /** Rich label allowed (e.g. a colored status dot + text). */
  label: React.ReactNode
}

export interface SelectMenuProps {
  value:       string
  onChange:    (v: string) => void
  options:     SelectOption[]
  /** Text shown when nothing is selected */
  placeholder?: string
  className?:  string
  /** Adds a top item that sets value to '' */
  nullable?:   boolean
  nullLabel?:  string
  /** Shows a search box inside the dropdown — useful for long lists */
  searchable?: boolean
  size?:       'sm' | 'default'
  disabled?:   boolean
}

export function SelectMenu({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
  nullable,
  nullLabel = 'All',
  searchable,
  size = 'default',
  disabled,
}: SelectMenuProps) {
  const [open,    setOpen]    = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [query,   setQuery]   = React.useState('')

  const btnRef    = React.useRef<HTMLButtonElement>(null)
  const menuRef   = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => { setMounted(true) }, [])

  // Position the floating menu
  React.useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return
    const a   = btnRef.current.getBoundingClientRect()
    const m   = menuRef.current
    const mw  = m.offsetWidth  || 200
    const mh  = m.offsetHeight || 240
    const pad = 8

    let top  = a.bottom + 4
    if (top + mh > window.innerHeight - pad) top = a.top - mh - 4
    if (top < pad) top = a.bottom + 4

    let left = a.left
    if (left + mw > window.innerWidth - pad) left = a.right - mw
    left = Math.max(pad, left)

    m.style.top      = `${Math.round(top)}px`
    m.style.left     = `${Math.round(left)}px`
    m.style.minWidth = `${Math.round(a.width)}px`
  }, [open])

  // Focus search input when dropdown opens
  React.useEffect(() => {
    if (open && searchable) {
      const t = setTimeout(() => searchRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
  }, [open, searchable])

  // Close on outside click / Escape
  React.useEffect(() => {
    if (!open) return
    function onMouse(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return
      if (menuRef.current?.contains(e.target as Node)) return
      close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown',   onKey)
    }
  }, [open])

  function close() { setOpen(false); setQuery('') }

  function select(v: string) { onChange(v); close() }

  const selectedLabel = options.find((o) => o.value === value)?.label
  const displayLabel  = selectedLabel ?? (nullable && !value ? nullLabel : placeholder)
  const hasValue      = Boolean(value)

  const filtered = searchable && query
    ? options.filter((o) => typeof o.label === 'string' && o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const h = size === 'sm' ? 'h-9' : 'h-10'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((o) => !o) }}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm transition-colors',
          h,
          'hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring',
          open     && 'ring-2 ring-ring border-ring',
          !hasValue && 'text-muted-foreground',
          hasValue  && 'text-foreground',
          disabled  && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className={cn(
          'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150',
          open && 'rotate-180',
        )} />
      </button>

      {open && mounted && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999 }}
          className="rounded-xl border border-border bg-popover shadow-card overflow-hidden"
        >
          {/* Search */}
          {searchable && (
            <div className="border-b border-border px-2 py-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="h-7 flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1 overscroll-contain">
            {/* Nullable / clear option */}
            {nullable && (
              <button
                type="button"
                onClick={() => select('')}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-1.5 text-sm transition-colors',
                  !value
                    ? 'bg-accent text-foreground'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                {nullLabel}
                {!value && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            )}

            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No results</p>
            )}

            {filtered.map((opt) => {
              const sel = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => select(opt.value)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm transition-colors',
                    sel
                      ? 'bg-accent text-foreground'
                      : 'text-foreground hover:bg-accent',
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {sel && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

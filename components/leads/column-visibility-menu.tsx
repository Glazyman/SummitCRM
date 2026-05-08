'use client'

import * as React from 'react'
import { Columns3, ChevronUp, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { COLUMNS } from './types'
import type { ColumnId } from './types'

interface ColumnVisibilityMenuProps {
  visibleColumns: Set<ColumnId>
  columnOrder:    ColumnId[]
  onToggle:       (id: ColumnId) => void
  onReorder:      (order: ColumnId[]) => void
}

export function ColumnVisibilityMenu({
  visibleColumns,
  columnOrder,
  onToggle,
  onReorder,
}: ColumnVisibilityMenuProps) {
  const [open, setOpen] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  function moveUp(i: number) {
    if (i <= 1) return // index 0 is 'name' — locked at top
    const next = [...columnOrder]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    onReorder(next)
  }

  function moveDown(i: number) {
    if (i === 0) return // name stays locked
    if (i === columnOrder.length - 1) return
    const next = [...columnOrder]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    onReorder(next)
  }

  const colMap = new Map(COLUMNS.map(c => [c.id, c]))
  const hiddenCount = columnOrder.filter(id => !visibleColumns.has(id)).length

  return (
    <div ref={panelRef} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5"
        onClick={() => setOpen(p => !p)}
      >
        <Columns3 className="h-4 w-4" />
        <span className="hidden sm:inline">Columns</span>
        {hiddenCount > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
            {hiddenCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border bg-popover shadow-card animate-dropdown-in">
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Columns</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Toggle and reorder</p>
          </div>

          <div className="p-1.5 max-h-80 overflow-y-auto">
            {columnOrder.map((id, i) => {
              const col = colMap.get(id)
              if (!col) return null
              const isLocked  = !col.optional
              const isVisible = visibleColumns.has(id)
              const isFirst   = i === 0
              const isLast    = i === columnOrder.length - 1

              return (
                <div
                  key={id}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm',
                    'group transition-colors hover:bg-muted/50'
                  )}
                >
                  {/* Up/Down reorder buttons */}
                  <div className="flex flex-col gap-0 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveUp(i)}
                      disabled={isFirst || i === 1 && isLocked}
                      className="p-0.5 text-muted-foreground/40 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(i)}
                      disabled={isFirst || isLast}
                      className="p-0.5 text-muted-foreground/40 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Visibility toggle */}
                  <button
                    type="button"
                    onClick={() => !isLocked && onToggle(id)}
                    disabled={isLocked}
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                      isVisible
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground/30 text-transparent',
                      isLocked && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </button>

                  {/* Label */}
                  <span className={cn(
                    'flex-1 text-sm select-none',
                    !isVisible && 'text-muted-foreground',
                    isLocked && 'font-medium'
                  )}>
                    {col.label}
                  </span>

                  {isLocked && (
                    <span className="text-[10px] text-muted-foreground/50">fixed</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

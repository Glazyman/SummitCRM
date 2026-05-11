'use client'

import * as React from 'react'
import { Columns3, Check, RotateCcw, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { COLUMNS, DEFAULT_COLUMN_ORDER } from './types'
import type { ColumnId } from './types'

interface ColumnVisibilityMenuProps {
  visibleColumns: Set<ColumnId>
  columnOrder:    ColumnId[]
  onToggle:       (id: ColumnId) => void
  onReorder:      (order: ColumnId[]) => void
  onSave:         (order: ColumnId[], visible: Set<ColumnId>) => void
}

export function ColumnVisibilityMenu({
  visibleColumns,
  columnOrder,
  onToggle,
  onReorder,
  onSave,
}: ColumnVisibilityMenuProps) {
  const [open,      setOpen]      = React.useState(false)
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const [dropIndex, setDropIndex] = React.useState<number | null>(null)
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

  // ── Drag handlers ────────────────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, i: number) {
    setDragIndex(i)
    e.dataTransfer.effectAllowed = 'move'
    // Transparent drag image so the row itself shows the drag state
    e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 0, 0)
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndex(i)
  }

  function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === targetIndex) {
      endDrag()
      return
    }
    const next = [...columnOrder]
    const [item] = next.splice(dragIndex, 1)
    next.splice(targetIndex, 0, item)
    onReorder(next)
    endDrag()
  }

  function endDrag() {
    setDragIndex(null)
    setDropIndex(null)
  }

  // ── Other actions ─────────────────────────────────────────────────────────
  function handleReset() {
    onReorder(DEFAULT_COLUMN_ORDER)
    COLUMNS.forEach(c => {
      const shouldBeOn = c.defaultOn
      const isOn = visibleColumns.has(c.id)
      if (shouldBeOn !== isOn && c.optional) onToggle(c.id)
    })
  }

  function handleSave() {
    onSave(columnOrder, visibleColumns)
    setOpen(false)
  }

  const colMap      = new Map(COLUMNS.map(c => [c.id, c]))
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
        <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-border bg-popover shadow-card animate-dropdown-in flex flex-col">

          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Columns</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Toggle visibility · drag to reorder</p>
          </div>

          {/* Column list */}
          <div
            className="p-1.5 max-h-72 overflow-y-auto"
            onDragLeave={(e) => {
              // Only clear dropIndex when leaving the entire list, not between items
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropIndex(null)
              }
            }}
            onDragEnd={endDrag}
          >
            {columnOrder.map((id, i) => {
              const col = colMap.get(id)
              if (!col) return null
              const isLocked  = !col.optional
              const isVisible = visibleColumns.has(id)
              const isDragging = dragIndex === i
              const isDropTarget = dropIndex === i && dragIndex !== null && dragIndex !== i

              return (
                <div key={id} className="relative">
                  {/* Drop indicator line — above this item */}
                  {isDropTarget && dragIndex !== null && dragIndex > i && (
                    <div className="absolute -top-px left-2 right-2 h-0.5 rounded-full bg-primary z-10 pointer-events-none" />
                  )}

                  <div
                    draggable={!isLocked}
                    onDragStart={(e) => !isLocked && handleDragStart(e, i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={(e) => handleDrop(e, i)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                      isDragging
                        ? 'opacity-40 bg-muted/50'
                        : 'hover:bg-muted/50',
                      isDropTarget && 'bg-primary/5',
                    )}
                  >
                    {/* Drag handle */}
                    <GripVertical className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-colors',
                      isLocked
                        ? 'text-transparent cursor-default'
                        : 'text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing',
                    )} />

                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => !isLocked && onToggle(id)}
                      disabled={isLocked}
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        isVisible
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-muted-foreground/30 text-transparent',
                        isLocked && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      <Check className="h-2.5 w-2.5" />
                    </button>

                    {/* Label */}
                    <span className={cn(
                      'flex-1 text-sm select-none',
                      !isVisible && 'text-muted-foreground',
                      isLocked && 'font-medium',
                    )}>
                      {col.label}
                    </span>

                    {isLocked && <span className="text-[10px] text-muted-foreground/50">fixed</span>}
                  </div>

                  {/* Drop indicator line — below this item */}
                  {isDropTarget && dragIndex !== null && dragIndex < i && (
                    <div className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full bg-primary z-10 pointer-events-none" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
            <Button
              size="sm"
              className="ml-auto h-7 gap-1.5 text-xs"
              onClick={handleSave}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

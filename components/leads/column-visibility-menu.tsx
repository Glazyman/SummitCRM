'use client'

import { Columns3, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { COLUMNS } from './types'
import type { ColumnId } from './types'

interface ColumnVisibilityMenuProps {
  visibleColumns: Set<ColumnId>
  onToggle:       (id: ColumnId) => void
}

/**
 * Dropdown menu allowing the user to show/hide optional table columns.
 */
export function ColumnVisibilityMenu({
  visibleColumns,
  onToggle,
}: ColumnVisibilityMenuProps) {
  const optional  = COLUMNS.filter((c) => c.optional)
  const onCount   = optional.filter((c) => visibleColumns.has(c.id)).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Columns3 className="h-4 w-4" />
          <span className="hidden sm:inline">Columns</span>
          {onCount < optional.length && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
              {onCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" minWidth="180px">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Required columns — shown as disabled */}
        {COLUMNS.filter((c) => !c.optional).map((col) => (
          <div
            key={col.id}
            className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm opacity-40"
          >
            <Check className="h-3.5 w-3.5 shrink-0" />
            {col.label}
            <span className="ml-auto text-xs">required</span>
          </div>
        ))}

        <DropdownMenuSeparator />

        {/* Optional columns — toggleable */}
        {optional.map((col) => {
          const on = visibleColumns.has(col.id)
          return (
            <DropdownMenuItem
              key={col.id}
              onClick={() => onToggle(col.id)}
              className="gap-2"
            >
              <span className={cn(
                'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded',
                on ? 'text-foreground' : 'text-transparent border border-muted-foreground/30'
              )}>
                <Check className="h-3 w-3" />
              </span>
              {col.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

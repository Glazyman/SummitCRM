'use client'

import * as React from 'react'
import { Plus, Check, Tag as TagIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TagBadge } from './tag-badge'

interface Tag {
  id:    string
  name:  string
  color: string
}

interface TagPickerProps {
  selectedTags: Tag[]
  availableTags: Tag[]
  onAdd:    (tag: Tag) => void
  onRemove: (tagId: string) => void
  onCreateTag?: (name: string, color: string) => Promise<Tag>
  readonly?: boolean
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#78716c',
]

export function TagPicker({
  selectedTags,
  availableTags,
  onAdd,
  onRemove,
  onCreateTag,
  readonly = false,
}: TagPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [newColor, setNewColor] = React.useState(PRESET_COLORS[0])
  const ref = React.useRef<HTMLDivElement>(null)

  const selectedIds = new Set(selectedTags.map((t) => t.id))
  const filtered = availableTags.filter(
    (t) => !query || t.name.toLowerCase().includes(query.toLowerCase())
  )
  const showCreate = onCreateTag && query.trim() && !availableTags.some(
    (t) => t.name.toLowerCase() === query.trim().toLowerCase()
  )

  // Close on outside click
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleCreate() {
    if (!onCreateTag || !query.trim()) return
    setCreating(true)
    try {
      const tag = await onCreateTag(query.trim(), newColor)
      onAdd(tag)
      setQuery('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      {/* Selected tags + add button */}
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedTags.map((tag) => (
          <TagBadge
            key={tag.id}
            name={tag.name}
            color={tag.color}
            onRemove={readonly ? undefined : () => onRemove(tag.id)}
            size="sm"
          />
        ))}
        {!readonly && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors',
            )}
          >
            <Plus className="h-3 w-3" />
            Add tag
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-xl border border-border bg-popover shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <TagIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search or create tag…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && showCreate && handleCreate()}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 rounded-lg border-0 focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 && !showCreate && (
              <p className="px-3 py-2 text-xs text-muted-foreground text-center">No tags found</p>
            )}
            {filtered.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => {
                  selectedIds.has(tag.id) ? onRemove(tag.id) : onAdd(tag)
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors"
              >
                <div
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="flex-1 text-left truncate">{tag.name}</span>
                {selectedIds.has(tag.id) && (
                  <Check className="h-3 w-3 text-primary flex-shrink-0" />
                )}
              </button>
            ))}

            {showCreate && (
              <div className="border-t border-border mt-1 pt-1">
                {/* Color picker row */}
                <div className="flex flex-wrap gap-1 px-2 pt-1 pb-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={cn(
                        'h-4 w-4 rounded-full transition-transform',
                        newColor === c ? 'ring-2 ring-offset-1 ring-ring scale-110' : 'hover:scale-110'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: newColor }}
                  />
                  <span className="flex-1 text-left">
                    Create <strong>&ldquo;{query.trim()}&rdquo;</strong>
                  </span>
                  <Plus className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </button>
              </div>
            )}
          </div>

          <div className="p-2 border-t border-border">
            <button
              type="button"
              onClick={() => { setOpen(false); setQuery('') }}
              className="flex items-center gap-1 w-full justify-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import * as React from 'react'
import { StickyNote, Send, AtSign, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const MAX_LENGTH = 5000

export interface NoteRecipient {
  id:    string
  name:  string
  role?: string
}

interface NoteEditorProps {
  /** Persist a note. Returns once saved. Accepts zero, one, or many recipients. */
  onSave: (content: string, assignedTo: string[]) => Promise<void>
  /** Workspace members the current user is allowed to assign notes to.
   *  Empty list hides the recipient dropdown. */
  recipients?: NoteRecipient[]
}

/**
 * Composer for new notes.
 * - Character count, submit on Cmd/Ctrl+Enter, textarea auto-grows
 * - "Assign to" dropdown is multi-select and styled to match the other
 *   dropdowns in the side panel (DropdownMenu trigger + popover items
 *   with chevron + checkmarks). Stays open while toggling recipients.
 */
export function NoteEditor({ onSave, recipients }: NoteEditorProps) {
  const [content,      setContent]      = React.useState('')
  const [assignedIds,  setAssignedIds]  = React.useState<string[]>([])
  const [saving,       setSaving]       = React.useState(false)
  const [focused,      setFocused]      = React.useState(false)
  const textareaRef                     = React.useRef<HTMLTextAreaElement>(null)

  const remaining   = MAX_LENGTH - content.length
  const isOverflow  = remaining < 0
  const canSubmit   = content.trim().length > 0 && !isOverflow && !saving
  const showAssign  = !!recipients && recipients.length > 0

  function autoResize() {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 300)}px`
    }
  }

  function toggleRecipient(id: string) {
    setAssignedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleSave() {
    if (!canSubmit) return
    setSaving(true)
    try {
      await onSave(content.trim(), assignedIds)
      setContent('')
      setAssignedIds([])
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  // Resolve picked recipient names for the trigger label.
  const pickedNames = (recipients ?? [])
    .filter((r) => assignedIds.includes(r.id))
    .map((r) => r.name)
  const triggerLabel = pickedNames.length === 0
    ? 'Assign to…'
    : pickedNames.length === 1
      ? pickedNames[0]
      : `${pickedNames.length} people`

  return (
    <div className={cn(
      'rounded-xl border transition-all duration-150',
      focused
        ? 'border-ring ring-2 ring-ring/20'
        : 'border-border hover:border-muted-foreground/30'
    )}>
      <div className="flex items-start gap-2.5 px-3 pt-3">
        <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => { setContent(e.target.value); autoResize() }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Add a note… (Cmd/Ctrl+Enter to save)"
          rows={3}
          maxLength={MAX_LENGTH + 50}
          className={cn(
            'min-h-[72px] w-full resize-none bg-transparent text-sm placeholder:text-muted-foreground',
            'focus:outline-none leading-relaxed'
          )}
        />
      </div>

      <div className={cn(
        'flex flex-wrap items-center justify-between gap-2 px-3 pb-2.5 pt-1',
        'transition-opacity',
        focused || content || assignedIds.length > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        {/* Left: assign-to dropdown + char count */}
        <div className="flex items-center gap-2">
          {showAssign && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    'h-7 gap-1.5 px-2 text-xs font-medium',
                    assignedIds.length > 0 && 'border-primary/40 bg-primary/5 text-foreground'
                  )}
                >
                  <AtSign className="h-3 w-3 opacity-60" />
                  {triggerLabel}
                  <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" minWidth="200px">
                <DropdownMenuLabel>Assign this note to</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {recipients!.map((r) => {
                  const picked = assignedIds.includes(r.id)
                  return (
                    <DropdownMenuItem
                      key={r.id}
                      // preventDefault keeps the menu open while toggling.
                      onClick={(e) => { e.preventDefault(); toggleRecipient(r.id) }}
                      className="flex items-center gap-2"
                    >
                      <span className={cn(
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                        picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                      )}>
                        {picked && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className="flex-1 truncate">
                        {r.name}
                        {r.role && <span className="ml-1 text-xs text-muted-foreground">· {r.role}</span>}
                      </span>
                    </DropdownMenuItem>
                  )
                })}
                {assignedIds.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => { e.preventDefault(); setAssignedIds([]) }}
                      className="text-xs text-muted-foreground"
                    >
                      Clear selection
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className={cn(
            'text-xs tabular-nums',
            isOverflow
              ? 'text-destructive font-medium'
              : remaining < 200
                ? 'text-foreground'
                : 'text-muted-foreground'
          )}>
            {remaining.toLocaleString()} left
          </span>
        </div>

        {/* Right: clear + save */}
        <div className="flex items-center gap-2">
          {(content || assignedIds.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setContent('')
                setAssignedIds([])
                if (textareaRef.current) textareaRef.current.style.height = 'auto'
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleSave}
            disabled={!canSubmit}
          >
            {saving ? (
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                Saving…
              </span>
            ) : (
              <>
                <Send className="h-3 w-3" />
                Save note
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

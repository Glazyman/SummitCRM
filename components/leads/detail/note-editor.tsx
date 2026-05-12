'use client'

import * as React from 'react'
import { StickyNote, Send, AtSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const MAX_LENGTH = 5000

export interface NoteRecipient {
  id:    string
  name:  string
  role?: string
}

interface NoteEditorProps {
  /** Persist a note. Returns once saved. */
  onSave: (content: string, assignedTo: string | null) => Promise<void>
  /** Workspace members the current user is allowed to assign notes to.
   *  Empty list hides the recipient dropdown. */
  recipients?: NoteRecipient[]
}

/**
 * Composer for new notes.
 * Character count, submit on Cmd/Ctrl+Enter, textarea auto-grows, and
 * an optional "Assign to" dropdown that mentions a teammate.
 */
export function NoteEditor({ onSave, recipients }: NoteEditorProps) {
  const [content,    setContent]    = React.useState('')
  const [assignedTo, setAssignedTo] = React.useState<string>('')
  const [saving,     setSaving]     = React.useState(false)
  const [focused,    setFocused]    = React.useState(false)
  const textareaRef                 = React.useRef<HTMLTextAreaElement>(null)

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

  async function handleSave() {
    if (!canSubmit) return
    setSaving(true)
    try {
      await onSave(content.trim(), assignedTo || null)
      setContent('')
      setAssignedTo('')
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
        focused || content ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        {/* Assign-to picker — left side */}
        <div className="flex items-center gap-2">
          {showAssign && (
            <label className="flex items-center gap-1 text-xs">
              <AtSign className="h-3 w-3 text-muted-foreground" />
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-6 rounded-md border border-border bg-background px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No one (just a note)</option>
                {recipients!.map((r) => (
                  <option key={r.id} value={r.id}>
                    Assign to {r.name}{r.role ? ` (${r.role})` : ''}
                  </option>
                ))}
              </select>
            </label>
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

        <div className="flex items-center gap-2">
          {content && (
            <button
              type="button"
              onClick={() => { setContent(''); setAssignedTo(''); if (textareaRef.current) textareaRef.current.style.height = 'auto' }}
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

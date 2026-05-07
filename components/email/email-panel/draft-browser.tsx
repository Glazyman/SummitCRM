'use client'

import * as React from 'react'
import { FileText, Trash2, Clock, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDraftsForLead, deleteDraft, formatDraftAge } from './draft-storage'
import type { EmailDraft } from './types'

interface DraftBrowserProps {
  leadId:        string
  currentDraftId:string | null
  onLoad:        (draft: EmailDraft) => void
  onRefresh?:    () => void
}

export function DraftBrowser({
  leadId, currentDraftId, onLoad, onRefresh,
}: DraftBrowserProps) {
  const [drafts, setDrafts] = React.useState<EmailDraft[]>([])

  function refresh() {
    setDrafts(getDraftsForLead(leadId))
    onRefresh?.()
  }

  // Refresh on mount and when leadId changes
  React.useEffect(() => { refresh() }, [leadId])

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    deleteDraft(id)
    refresh()
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">No drafts saved yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start composing and click &ldquo;Save draft&rdquo; — or drafts auto-save every 3 seconds.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 space-y-2">
      <p className="px-1 text-xs text-muted-foreground">{drafts.length} saved draft{drafts.length !== 1 ? 's' : ''}</p>
      {drafts.map((draft) => (
        // Outer div with role="button" prevents nested <button> invalid HTML
        <div
          key={draft.id}
          role="button"
          tabIndex={0}
          onClick={() => onLoad(draft)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLoad(draft) } }}
          className={cn(
            'group w-full rounded-xl border p-3 text-left transition-colors cursor-pointer',
            draft.id === currentDraftId
              ? 'border-primary/40 bg-primary/5'
              : 'border-border hover:border-border/60 hover:bg-muted/40'
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {/* Subject / label */}
              <div className="flex items-center gap-1.5">
                {draft.id === currentDraftId && (
                  <PenLine className="h-3 w-3 shrink-0 text-primary" />
                )}
                <p className="truncate text-sm font-medium">
                  {draft.subject || <span className="text-muted-foreground italic">No subject</span>}
                </p>
              </div>

              {/* Body preview */}
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {draft.body?.slice(0, 120) || <em>Empty</em>}
              </p>

              {/* Timestamp */}
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                Auto-saved {formatDraftAge(draft.saved_at)}
              </div>
            </div>

            {/* Delete */}
            <button
              type="button"
              onClick={(e) => handleDelete(draft.id, e)}
              className="mt-0.5 shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Delete draft"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

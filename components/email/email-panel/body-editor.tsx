'use client'

import * as React from 'react'
import {
  Bold, Italic, List, Link2, Eye, EyeOff,
  AlignLeft, Type, Hash,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { previewMergeVars, validateMergeVars } from '@/lib/email/merge'

// ── Merge variable chips ──────────────────────────────────────────────────
const MERGE_CHIPS = [
  { label: '{{first_name}}',   display: 'First name'  },
  { label: '{{last_name}}',    display: 'Last name'   },
  { label: '{{full_name}}',    display: 'Full name'   },
  { label: '{{company}}',      display: 'Company'     },
  { label: '{{title}}',        display: 'Job title'   },
  { label: '{{sender_name}}',  display: 'Your name'   },
]

// ── Text formatting helpers ────────────────────────────────────────────────
function insertAtCursor(
  ref:    React.RefObject<HTMLTextAreaElement | null>,
  before: string,
  after:  string,
  setter: (fn: (prev: string) => string) => void,
) {
  const el = ref.current
  if (!el) return
  const start = el.selectionStart
  const end   = el.selectionEnd
  const selected = el.value.slice(start, end)
  const newVal   = el.value.slice(0, start) + before + selected + after + el.value.slice(end)
  setter(() => newVal)
  setTimeout(() => {
    el.focus()
    const cursor = start + before.length + selected.length + after.length
    el.setSelectionRange(cursor, cursor)
  }, 0)
}

// ── Props ─────────────────────────────────────────────────────────────────
interface BodyEditorProps {
  value:     string
  onChange:  (v: string) => void
  className?: string
  minRows?:   number
  maxRows?:   number
}

export function BodyEditor({
  value, onChange, className, minRows = 12, maxRows = 28,
}: BodyEditorProps) {
  const [previewMode,  setPreviewMode]  = React.useState(false)
  const [showMerge,    setShowMerge]    = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  const wordCount  = value.trim() ? value.trim().split(/\s+/).length : 0
  const charCount  = value.length
  const unknownVars = validateMergeVars(value)

  // Auto-resize textarea
  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineH  = 20
    const minH   = minRows * lineH
    const maxH   = maxRows * lineH
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minH), maxH)}px`
  }

  React.useEffect(() => { autoResize() }, [value])

  function insert(before: string, after = '') {
    insertAtCursor(textareaRef, before, after, (fn) => onChange(fn(value)))
  }

  // ── Toolbar buttons ──────────────────────────────────────────────────
  const toolbarButtons: Array<{
    icon: React.ReactNode
    tooltip: string
    action: () => void
    active?: boolean
  }> = [
    {
      icon: <Bold className="h-3.5 w-3.5" />,
      tooltip: 'Bold (Ctrl+B)',
      action: () => insert('**', '**'),
    },
    {
      icon: <Italic className="h-3.5 w-3.5" />,
      tooltip: 'Italic (Ctrl+I)',
      action: () => insert('_', '_'),
    },
    {
      icon: <List className="h-3.5 w-3.5" />,
      tooltip: 'Bullet point',
      action: () => insert('\n• ', ''),
    },
    {
      icon: <Link2 className="h-3.5 w-3.5" />,
      tooltip: 'Insert link',
      action: () => insert('[', '](https://)'),
    },
    {
      icon: <Hash className="h-3.5 w-3.5" />,
      tooltip: 'Merge variables',
      action: () => setShowMerge((v) => !v),
      active: showMerge,
    },
  ]

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); insert('**', '**') }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); insert('_', '_') }
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') { e.preventDefault(); setPreviewMode((v) => !v) }
  }

  // ── Rendered preview HTML ──────────────────────────────────────────────
  const previewHtml = textToHtml(previewMergeVars(value))

  return (
    <div className={cn('flex flex-col', className)}>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          {toolbarButtons.map((btn) => (
            <button
              key={btn.tooltip}
              type="button"
              title={btn.tooltip}
              onClick={btn.action}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
                'hover:bg-muted hover:text-foreground',
                btn.active && 'bg-muted text-foreground'
              )}
            >
              {btn.icon}
            </button>
          ))}
        </div>

        {/* Preview toggle */}
        <button
          type="button"
          onClick={() => setPreviewMode((v) => !v)}
          title="Preview (Ctrl+P)"
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
            previewMode
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {previewMode
            ? <><EyeOff className="h-3 w-3" /> Edit</>
            : <><Eye className="h-3 w-3" /> Preview</>
          }
        </button>
      </div>

      {/* ── Merge variable chips (collapsible) ── */}
      {showMerge && !previewMode && (
        <div className="flex flex-wrap gap-1 border-b border-border bg-violet-50/50 px-3 py-2 dark:bg-violet-900/10">
          {MERGE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => insert(chip.label)}
              className="rounded-md border border-dashed border-violet-300 bg-white px-2 py-0.5 text-xs font-mono text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-transparent dark:text-violet-400"
            >
              {chip.display}
            </button>
          ))}
        </div>
      )}

      {/* ── Editor area ── */}
      {previewMode ? (
        <div
          className="min-h-[200px] flex-1 overflow-y-auto px-3 py-3"
          dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-muted-foreground text-sm italic">Nothing to preview yet…</p>' }}
        />
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); autoResize() }}
          onKeyDown={handleKeyDown}
          placeholder={"Hi {{first_name}},\n\nI noticed your team at {{company}}…"}
          className={cn(
            'flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-relaxed',
            'placeholder:text-muted-foreground/60',
            'focus:outline-none',
            'overflow-y-auto'
          )}
          style={{ minHeight: `${minRows * 20}px`, maxHeight: `${maxRows * 20}px` }}
          spellCheck
        />
      )}

      {/* ── Footer: word count + warnings ── */}
      <div className="flex items-center justify-between border-t border-border bg-muted/10 px-3 py-1.5">
        <div className="flex items-center gap-3">
          {unknownVars.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <Type className="h-3 w-3" />
              Unknown: {unknownVars.map((v) => `{{${v}}}`).join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground tabular-nums">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
        </div>
      </div>
    </div>
  )
}

// ── Convert plain text / light markdown → display HTML ────────────────────
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Convert line-by-line so we can detect bullet points
  const lines = escaped.split('\n')
  let inList = false
  const out: string[] = []

  for (const rawLine of lines) {
    const line = rawLine
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, '<a href="$2" class="text-primary underline">$1</a>')

    if (line.startsWith('• ')) {
      if (!inList) { out.push('<ul class="list-disc pl-5 my-1">'); inList = true }
      out.push(`<li>${line.slice(2)}</li>`)
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(line === '' ? '</p><p class="my-2">' : line + '<br>')
    }
  }
  if (inList) out.push('</ul>')

  return `<p class="my-0">${out.join('')}</p>`
}

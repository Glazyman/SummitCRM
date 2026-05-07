'use client'

import * as React from 'react'
import { Search, FileText, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  EMAIL_TEMPLATES,
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_CATEGORY_COLORS,
} from './mock-templates'
import type { EmailTemplate, TemplateCategory } from './types'

interface TemplateBrowserProps {
  onSelect: (template: EmailTemplate) => void
}

export function TemplateBrowser({ onSelect }: TemplateBrowserProps) {
  const [search,   setSearch]   = React.useState('')
  const [category, setCategory] = React.useState<TemplateCategory | 'all'>('all')
  const [expanded, setExpanded] = React.useState<string | null>(null)

  const categories = Array.from(new Set(EMAIL_TEMPLATES.map((t) => t.category)))

  const filtered = EMAIL_TEMPLATES.filter((t) => {
    const matchCat  = category === 'all' || t.category === category
    const q         = search.toLowerCase()
    const matchSearch = !q || t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  return (
    <div className="flex h-full flex-col">

      {/* Search */}
      <div className="relative px-3 pb-2">
        <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Category filter chips */}
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-3 scrollbar-hide">
        <CategoryChip
          label="All"
          active={category === 'all'}
          onClick={() => setCategory('all')}
        />
        {categories.map((cat) => (
          <CategoryChip
            key={cat}
            label={TEMPLATE_CATEGORY_LABELS[cat] ?? cat}
            active={category === cat}
            onClick={() => setCategory(cat as TemplateCategory)}
            colorClass={TEMPLATE_CATEGORY_COLORS[cat]}
          />
        ))}
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No templates found</p>
          </div>
        ) : (
          filtered.map((tpl) => {
            const isExpanded = expanded === tpl.id
            return (
              <div
                key={tpl.id}
                className={cn(
                  'overflow-hidden rounded-xl border transition-all',
                  isExpanded ? 'border-primary/30 bg-primary/5' : 'border-border hover:border-border/80 hover:bg-muted/30'
                )}
              >
                {/* Header row */}
                <button
                  type="button"
                  onClick={() => setExpanded(isExpanded ? null : tpl.id)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-medium truncate">{tpl.name}</span>
                      <span className={cn(
                        'inline-flex shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold',
                        TEMPLATE_CATEGORY_COLORS[tpl.category]
                      )}>
                        {TEMPLATE_CATEGORY_LABELS[tpl.category]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{tpl.description}</p>
                  </div>
                  <ChevronRight className={cn(
                    'mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                    isExpanded && 'rotate-90'
                  )} />
                </button>

                {/* Expanded preview */}
                {isExpanded && (
                  <div className="border-t border-border/50 px-3 py-3 space-y-2">
                    <div>
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Subject</p>
                      <p className="text-sm font-medium text-foreground">{tpl.subject}</p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-5 leading-relaxed">
                        {tpl.body}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelect(tpl)}
                      className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Use this template
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Category chip ─────────────────────────────────────────────────────────
function CategoryChip({
  label, active, onClick, colorClass,
}: {
  label:       string
  active:      boolean
  onClick:     () => void
  colorClass?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : colorClass
            ? cn('border-transparent', colorClass, 'opacity-80 hover:opacity-100')
            : 'border-border bg-background text-muted-foreground hover:bg-muted'
      )}
    >
      {label}
    </button>
  )
}

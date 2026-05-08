'use client'

/**
 * components/ai/subject-line-helper.tsx
 *
 * SubjectLineHelper — inline "✨ AI Suggest" button inside the subject field
 * of the email compose form. Shows 3 clickable subject line suggestions.
 */

import React, { useState } from 'react'
import { Button }          from '@/components/ui/button'
import { Sparkles, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SubjectLineHelperProps {
  leadId:      string
  emailBody?:  string
  onSelect:    (subject: string) => void
  className?:  string
}

export function SubjectLineHelper({
  leadId, emailBody, onSelect, className,
}: SubjectLineHelperProps) {
  const [open,      setOpen]     = useState(false)
  const [loading,   setLoading]  = useState(false)
  const [subjects,  setSubjects] = useState<string[]>([])
  const [error,     setError]    = useState<string | null>(null)

  const fetch3 = async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/ai/subject-line', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lead_id: leadId, email_body: emailBody, count: 3 }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to generate subjects')
        return
      }
      setSubjects(data.subjects ?? [])
      setOpen(true)
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (s: string) => {
    onSelect(s)
    setOpen(false)
    setSubjects([])
  }

  if (!open) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={fetch3}
          disabled={loading}
          className="h-7 px-2 text-xs gap-1 text-foreground hover:text-foreground hover:bg-secondary"
        >
          {loading ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          AI Suggest
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    )
  }

  return (
    <div className={cn('border border-border rounded-lg p-3 bg-secondary space-y-2', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          AI suggestions — click to use
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={fetch3}
            disabled={loading}
            title="Regenerate"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => { setOpen(false); setSubjects([]) }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {subjects.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelect(s)}
            className="w-full text-left text-sm px-3 py-2 rounded-md bg-white border border-transparent hover:border-border transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

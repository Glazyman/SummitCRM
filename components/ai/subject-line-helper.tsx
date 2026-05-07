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
          className="h-7 px-2 text-xs gap-1 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
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
    <div className={cn('border border-purple-200 dark:border-purple-800 rounded-lg p-3 bg-purple-50 dark:bg-purple-950/30 space-y-2', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-purple-700 dark:text-purple-300 flex items-center gap-1">
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
            className="w-full text-left text-sm px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-transparent hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

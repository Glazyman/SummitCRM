'use client'

/**
 * components/ai/follow-up-suggestion-card.tsx
 *
 * FollowUpSuggestionCard — shown inside the FollowUpModal after
 * the user clicks "Suggest with AI". Displays timing recommendation,
 * reason, and a draft follow-up email.
 *
 * "Accept Suggestion" auto-fills the follow-up modal's fields.
 */

import React, { useState } from 'react'
import { Button }    from '@/components/ui/button'
import { Badge }     from '@/components/ui/badge'
import {
  Sparkles, RefreshCw, Check, Clock, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FollowUpSuggestion {
  suggested_days: number
  reason:         string
  subject:        string
  body_text:      string
  tokens_used:    number
  cached:         boolean
}

interface FollowUpSuggestionCardProps {
  leadId:    string
  onAccept:  (suggestion: { daysFromNow: number; subject: string; body: string }) => void
  className?: string
}

export function FollowUpSuggestionCard({
  leadId, onAccept, className,
}: FollowUpSuggestionCardProps) {
  const [loading,    setLoading]    = useState(false)
  const [suggestion, setSuggestion] = useState<FollowUpSuggestion | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [expanded,   setExpanded]   = useState(false)
  const [accepted,   setAccepted]   = useState(false)

  const generate = async () => {
    setLoading(true)
    setError(null)
    setAccepted(false)
    try {
      const res  = await fetch('/api/ai/follow-up', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lead_id: leadId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to generate suggestion')
        return
      }
      setSuggestion(data as FollowUpSuggestion)
      setExpanded(true)
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = () => {
    if (!suggestion) return
    onAccept({
      daysFromNow: suggestion.suggested_days,
      subject:     suggestion.subject,
      body:        suggestion.body_text,
    })
    setAccepted(true)
  }

  if (!suggestion) {
    return (
      <div className={cn('space-y-2', className)}>
        <Button
          type="button"
          variant="outline"
          onClick={generate}
          disabled={loading}
          className="w-full gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/20"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? 'Analysing outreach history…' : 'Suggest with AI'}
        </Button>
        {error && (
          <div className="flex items-center gap-2 text-destructive text-xs">
            <AlertCircle className="h-3 w-3" /> {error}
          </div>
        )}
      </div>
    )
  }

  const isNoFollowUp = suggestion.suggested_days === -1

  return (
    <div className={cn(
      'rounded-lg border p-4 space-y-3',
      'border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20',
      className,
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
            AI Suggestion
          </span>
          {suggestion.cached && (
            <Badge variant="outline" className="text-xs">Cached</Badge>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={generate}
          disabled={loading}
          className="h-7 px-2 text-xs gap-1"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Regenerate
        </Button>
      </div>

      {/* Timing */}
      {isNoFollowUp ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-green-500" />
          This lead has already replied — no follow-up needed.
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded-md px-3 py-2 border">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">
              {suggestion.suggested_days} day{suggestion.suggested_days !== 1 ? 's' : ''} from now
            </span>
          </div>
          <span className="text-xs text-muted-foreground flex-1">
            {suggestion.reason}
          </span>
        </div>
      )}

      {/* Draft preview (collapsible) */}
      {!isNoFollowUp && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Hide' : 'Show'} draft email
          </button>

          {expanded && (
            <div className="rounded-md bg-white dark:bg-gray-900 border p-3 space-y-2 text-sm">
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Subject
                </span>
                <p className="mt-0.5">{suggestion.subject}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Body
                </span>
                <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground leading-relaxed">
                  {suggestion.body_text}
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t">
                <Badge variant="secondary" className="text-xs">
                  {suggestion.tokens_used} tokens
                </Badge>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Accept */}
      {!isNoFollowUp && (
        <Button
          type="button"
          onClick={handleAccept}
          disabled={accepted}
          className="w-full gap-2"
          size="sm"
        >
          {accepted ? (
            <><Check className="h-4 w-4" /> Accepted</>
          ) : (
            'Accept Suggestion'
          )}
        </Button>
      )}
    </div>
  )
}

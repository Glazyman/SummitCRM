'use client'

/**
 * components/ai/ai-draft-modal.tsx
 *
 * AIDraftModal — opens when user clicks "AI Draft" on a lead.
 * Flow:
 *  1. User selects tone + optional context
 *  2. Clicks "Generate Draft" → POST /api/ai/draft-email
 *  3. Shows editable result: subject + body
 *  4. "Use This Draft" pre-fills the email panel / compose modal
 *  5. "Regenerate" clears cache & re-generates
 */

import React, { useState, useRef } from 'react'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button }   from '@/components/ui/button'
import { Label }    from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge }    from '@/components/ui/badge'
import {
  Sparkles, RefreshCw, Check, AlertCircle,
  ChevronDown, Wand2, Copy,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────
type AiTone = 'professional' | 'casual' | 'direct' | 'friendly'

interface AiDraftResult {
  subject:     string
  body_html:   string
  body_text:   string
  tokens_used: number
  cached:      boolean
  model:       string
  budget?:     { used_pct: number; warning: boolean }
}

interface AIDraftModalProps {
  open:               boolean
  onClose:            () => void
  leadId:             string
  sendingAccountId:   string
  leadName?:          string
  onUse:              (draft: { subject: string; body_html: string; body_text: string }) => void
}

// ── Tone config ───────────────────────────────────────────────────────────
const TONES: Array<{ value: AiTone; label: string; description: string; color: string }> = [
  { value: 'professional', label: 'Professional', description: 'Formal, concise, respectful',    color: 'bg-secondary text-foreground'   },
  { value: 'casual',       label: 'Casual',       description: 'Conversational, like a colleague', color: 'bg-secondary text-foreground' },
  { value: 'direct',       label: 'Direct',       description: 'No fluff, value first',          color: 'bg-secondary text-foreground'},
  { value: 'friendly',     label: 'Friendly',     description: 'Warm, genuine curiosity',        color: 'bg-secondary text-foreground'},
]

export function AIDraftModal({
  open, onClose, leadId, sendingAccountId, leadName, onUse,
}: AIDraftModalProps) {
  const [tone,      setTone]    = useState<AiTone>('professional')
  const [context,   setContext] = useState('')
  const [loading,   setLoading] = useState(false)
  const [error,     setError]   = useState<string | null>(null)
  const [result,    setResult]  = useState<AiDraftResult | null>(null)
  const [subject,   setSubject] = useState('')
  const [bodyText,  setBody]    = useState('')
  const [copied,    setCopied]  = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const generate = async (skipCache = false) => {
    setLoading(true)
    setError(null)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ai/draft-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          lead_id:            leadId,
          sending_account_id: sendingAccountId,
          tone,
          context:            context.trim() || undefined,
          // Append timestamp to context to bust cache on regenerate
          ...(skipCache ? { context: `${context.trim()} [regenerate:${Date.now()}]` } : {}),
        }),
        signal: abortRef.current.signal,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Generation failed. Please try again.')
        return
      }

      setResult(data as AiDraftResult)
      setSubject(data.subject   ?? '')
      setBody(data.body_text    ?? '')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError('Request failed. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleUse = () => {
    if (!result) return
    onUse({
      subject:   subject,
      body_html: result.body_html,
      body_text: bodyText,
    })
    onClose()
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${bodyText}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    abortRef.current?.abort()
    setResult(null)
    setSubject('')
    setBody('')
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-foreground" />
            AI Email Draft
            {leadName && (
              <span className="text-muted-foreground font-normal text-sm">
                — {leadName}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Generate a personalised cold email using AI. Review and edit before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-1">
          {/* ── Tone selector ──────────────────────────────────────────── */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Tone</Label>
            <div className="grid grid-cols-2 gap-2">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTone(t.value)}
                  className={cn(
                    'flex flex-col items-start p-3 rounded-lg border text-left transition-all',
                    tone === t.value
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-border hover:border-muted-foreground/40',
                  )}
                >
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full mb-1', t.color)}>
                    {t.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{t.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Optional context ──────────────────────────────────────── */}
          <div>
            <Label htmlFor="ai-context" className="text-sm font-medium mb-1 block">
              Additional context
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Textarea
              id="ai-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. Focus on our new feature X, mention their recent funding round, they use Salesforce..."
              className="h-20 resize-none text-sm"
              maxLength={500}
            />
            <div className="text-xs text-muted-foreground text-right mt-1">
              {context.length}/500
            </div>
          </div>

          {/* ── Generate button ────────────────────────────────────────── */}
          {!result && (
            <Button
              onClick={() => generate(false)}
              disabled={loading}
              className="w-full gap-2"
              size="lg"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {loading ? 'Generating…' : 'Generate Draft'}
            </Button>
          )}

          {/* ── Error ─────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* ── Result ────────────────────────────────────────────────── */}
          {result && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              {/* Subject */}
              <div>
                <Label className="text-sm font-medium mb-1 block">Subject line</Label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Body */}
              <div>
                <Label className="text-sm font-medium mb-1 block">Email body</Label>
                <Textarea
                  value={bodyText}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[180px] text-sm font-mono leading-relaxed resize-none"
                />
              </div>

              {/* Metadata */}
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="secondary" className="text-xs gap-1">
                  <Sparkles className="h-3 w-3" />
                  {result.tokens_used.toLocaleString()} tokens
                </Badge>
                <Badge variant={result.cached ? 'outline' : 'secondary'} className="text-xs">
                  {result.cached ? 'Cached result' : result.model}
                </Badge>
                {result.budget && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    Budget used: {result.budget.used_pct}%
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleUse}
                  className="flex-1 gap-2"
                >
                  <Check className="h-4 w-4" />
                  Use This Draft
                </Button>
                <Button
                  variant="outline"
                  onClick={() => generate(true)}
                  disabled={loading}
                  className="gap-2"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Regenerate
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="h-4 w-4 text-foreground" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

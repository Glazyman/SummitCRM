'use client'

import * as React from 'react'
import {
  Mail, Sparkles, Eye, ChevronDown, Send, Clock,
  AlertCircle, CheckCircle2, Loader2, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { QuotaChip } from './quota-status-badge'
import { previewMergeVars, validateMergeVars } from '@/lib/email/merge'
import type { SendingAccountPublic, QuotaStatus } from '@/lib/email/types'

// ── Types ─────────────────────────────────────────────────────────────────
interface LeadContext {
  id:         string
  email:      string
  first_name: string | null
  last_name:  string | null
  company:    string | null
  title:      string | null
}

interface ComposeEmailModalProps {
  open:            boolean
  lead:            LeadContext
  accounts:        SendingAccountPublic[]
  quotas:          Record<string, QuotaStatus>
  onClose:         () => void
  onSent:          (emailId: string) => void
}

// ── Merge variable chips for toolbar ─────────────────────────────────────
const MERGE_VARS = [
  { label: 'First name',   value: '{{first_name}}' },
  { label: 'Last name',    value: '{{last_name}}' },
  { label: 'Full name',    value: '{{full_name}}' },
  { label: 'Company',      value: '{{company}}' },
  { label: 'Title',        value: '{{title}}' },
  { label: 'Sender name',  value: '{{sender_name}}' },
]

export function ComposeEmailModal({
  open, lead, accounts, quotas, onClose, onSent,
}: ComposeEmailModalProps) {
  const [accountId, setAccountId]   = React.useState(accounts[0]?.id ?? '')
  const [subject,   setSubject]     = React.useState('')
  const [body,      setBody]        = React.useState('')
  const [preview,   setPreview]     = React.useState(false)
  const [schedule,  setSchedule]    = React.useState(false)
  const [schedAt,   setSchedAt]     = React.useState('')
  const [sending,   setSending]     = React.useState(false)
  const [error,     setError]       = React.useState<string | null>(null)
  const [sent,      setSent]        = React.useState<string | null>(null)

  const bodyRef = React.useRef<HTMLTextAreaElement>(null)

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setAccountId(accounts.find((a) => !quotas[a.id]?.at_limit)?.id ?? accounts[0]?.id ?? '')
      setSubject(''); setBody(''); setPreview(false)
      setSchedule(false); setSchedAt(''); setError(null); setSent(null)
    }
  }, [open, accounts, quotas])

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const selectedQuota   = accountId ? quotas[accountId] : null

  // Unknown merge variables warning
  const unknownVars = [
    ...validateMergeVars(subject),
    ...validateMergeVars(body),
  ].filter((v, i, arr) => arr.indexOf(v) === i)

  // Insert merge var at cursor position in body
  function insertMergeVar(v: string) {
    const el = bodyRef.current
    if (!el) { setBody((b) => b + v); return }
    const start = el.selectionStart
    const end   = el.selectionEnd
    const newVal = body.slice(0, start) + v + body.slice(end)
    setBody(newVal)
    // Restore cursor after insertion
    setTimeout(() => {
      el.setSelectionRange(start + v.length, start + v.length)
      el.focus()
    }, 0)
  }

  // ── Send ──────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!subject.trim()) { setError('Subject is required.'); return }
    if (!body.trim())    { setError('Email body is required.'); return }
    if (!accountId)      { setError('Select a sending account.'); return }

    setSending(true); setError(null)
    try {
      const payload: Record<string, unknown> = {
        lead_id:            lead.id,
        sending_account_id: accountId,
        subject:            subject.trim(),
        body_html:          bodyToHtml(body),
      }
      if (schedule && schedAt) {
        payload.scheduled_for = new Date(schedAt).toISOString()
      }

      const res  = await fetch('/api/emails/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok && res.status !== 202) {
        setError(data.error ?? 'Failed to send.')
        return
      }

      setSent(data.email_id)
      onSent(data.email_id)
    } catch (err) {
      setError(String(err))
    } finally {
      setSending(false)
    }
  }

  // ── Preview body ──────────────────────────────────────────────────────
  const previewSubject = selectedAccount
    ? previewMergeVars(subject).replace(/\{\{sender_name\}\}/g, selectedAccount.from_name)
    : previewMergeVars(subject)

  const previewBody = selectedAccount
    ? previewMergeVars(body).replace(/\{\{sender_name\}\}/g, selectedAccount.from_name)
    : previewMergeVars(body)

  if (sent) {
    return (
      <Dialog open={open} onClose={onClose}>
        <DialogContent size="sm">
          <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Email sent!</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your email to {lead.email} has been sent successfully.
              </p>
            </div>
            <Button onClick={onClose} className="w-full">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Compose Email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2">

          {/* ── To (read-only) ── */}
          <div className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2.5 text-sm">
            <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground uppercase">To</span>
            <div className="min-w-0 flex-1">
              <span className="font-medium">
                {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email}
              </span>
              {lead.first_name && (
                <span className="ml-2 text-muted-foreground">&lt;{lead.email}&gt;</span>
              )}
            </div>
          </div>

          {/* ── From (sending account picker) ── */}
          <div className="space-y-1.5">
            <Label>From</Label>
            <div className="space-y-2">
              {accounts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/10 dark:text-amber-400">
                  No sending accounts configured. Ask your admin to add one in Settings.
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="h-10 w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {accounts.map((a) => {
                      const q = quotas[a.id]
                      return (
                        <option key={a.id} value={a.id} disabled={q?.at_limit}>
                          {a.from_name} &lt;{a.from_email}&gt;{q ? ` (${q.remaining}/${a.daily_limit} left)` : ''}
                        </option>
                      )
                    })}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              )}

              {/* Quota bar */}
              {selectedQuota && (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          selectedQuota.at_limit ? 'bg-red-500' :
                          selectedQuota.percent_used >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                        )}
                        style={{ width: `${Math.min(100, selectedQuota.percent_used)}%` }}
                      />
                    </div>
                  </div>
                  <QuotaChip quota={selectedQuota} />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {selectedQuota.sent_today}/{selectedQuota.daily_limit}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Subject ── */}
          <div className="space-y-1.5">
            <Label>Subject <span className="text-destructive">*</span></Label>
            {preview
              ? <div className="h-10 rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">{previewSubject || <span className="text-muted-foreground italic">No subject</span>}</div>
              : <Input
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); setError(null) }}
                  placeholder="Quick question about {{company}}…"
                />
            }
          </div>

          {/* ── Body with merge variable toolbar ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Body <span className="text-destructive">*</span></Label>
              <button
                type="button"
                onClick={() => setPreview(!preview)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>

            {!preview && (
              <div className="flex flex-wrap gap-1 pb-1">
                {MERGE_VARS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => insertMergeVar(v.value)}
                    className="rounded-md border border-dashed border-violet-300 bg-violet-50 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900/10 dark:text-violet-400"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}

            {preview ? (
              <div
                className="min-h-[160px] rounded-xl border border-input bg-muted/20 p-4 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: bodyToHtml(previewBody) }}
              />
            ) : (
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => { setBody(e.target.value); setError(null) }}
                placeholder={`Hi {{first_name}},\n\nI noticed your team at {{company}} …`}
                rows={8}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            )}

            {unknownVars.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Unknown merge variables: {unknownVars.map((v) => `{{${v}}}`).join(', ')}
              </div>
            )}
          </div>

          {/* ── Schedule toggle ── */}
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2.5">
              <div
                onClick={() => setSchedule(!schedule)}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  schedule ? 'bg-primary' : 'bg-muted-foreground/30'
                )}
              >
                <div className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  schedule ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </div>
              <span className="text-sm">Schedule for later</span>
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            </label>

            {schedule && (
              <Input
                type="datetime-local"
                value={schedAt}
                onChange={(e) => setSchedAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            )}
          </div>

          {/* ── AI draft shortcut ── */}
          <button
            type="button"
            onClick={() => { /* TODO: open AI draft modal */ }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-violet-300 py-2.5 text-sm text-violet-600 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/20 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Generate with AI
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !body.trim() || !accountId || selectedQuota?.at_limit}
            className="gap-1.5"
          >
            {sending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
              : schedule && schedAt
                ? <><Clock className="h-3.5 w-3.5" /> Schedule</>
                : <><Send className="h-3.5 w-3.5" /> Send Email</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Helper: convert plain text to simple HTML ─────────────────────────────
function bodyToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}

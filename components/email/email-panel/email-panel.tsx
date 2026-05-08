'use client'

import * as React from 'react'
import {
  X, Mail, FileText, BookOpen, Clock,
  Send, Save, ChevronDown, Loader2,
  CheckCircle2, AlertCircle, Calendar,
  RotateCcw, Maximize2, Minimize2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccountPicker } from './account-picker'
import { BodyEditor } from './body-editor'
import { TemplateBrowser } from './template-browser'
import { DraftBrowser } from './draft-browser'
import { EmailHistoryPanel } from './email-history-panel'
import {
  saveDraft, createAutoSaver, getDraftsForLead,
} from './draft-storage'
import type { PanelTab, EmailDraft } from './types'
import type { SendingAccountPublic, QuotaStatus } from '@/lib/email/types'
import type { EmailHistoryItem } from '@/components/leads/detail/types'

// ── Tab config ────────────────────────────────────────────────────────────
const TABS: Array<{ id: PanelTab; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'compose',   label: 'Compose',   Icon: Mail      },
  { id: 'templates', label: 'Templates', Icon: BookOpen  },
  { id: 'drafts',    label: 'Drafts',    Icon: FileText  },
  { id: 'history',   label: 'History',   Icon: Clock     },
]

// ── Props ─────────────────────────────────────────────────────────────────
export interface EmailPanelProps {
  /** Is the panel currently open? */
  open:          boolean
  onClose:       () => void

  /** Lead being emailed */
  lead: {
    id:         string
    email:      string
    first_name: string | null
    last_name:  string | null
    company:    string | null
    title:      string | null
  }

  /** Sending accounts + live quotas */
  accounts: SendingAccountPublic[]
  quotas:   Record<string, QuotaStatus>

  /** Email history for the lead */
  emails: EmailHistoryItem[]

  /** Called after a successful send */
  onSent?: (emailId: string) => void

  /** Pre-fill from AI draft */
  initialSubject?: string
  initialBody?:    string
}

// ── Auto-save indicator states ────────────────────────────────────────────
type AutoSaveState = 'idle' | 'saving' | 'saved'

// ── Component ─────────────────────────────────────────────────────────────
export function EmailPanel({
  open, onClose, lead, accounts, quotas, emails, onSent,
  initialSubject, initialBody,
}: EmailPanelProps) {
  // ── Compose state ─────────────────────────────────────────────────────
  const [tab,          setTab]         = React.useState<PanelTab>('compose')
  const [accountId,    setAccountId]   = React.useState(
    () => accounts.find((a) => !quotas[a.id]?.at_limit)?.id ?? accounts[0]?.id ?? ''
  )
  const [subject,      setSubject]     = React.useState('')
  const [body,         setBody]        = React.useState('')
  const [scheduleAt,   setScheduleAt]  = React.useState('')
  const [showSchedule, setShowSchedule]= React.useState(false)
  const [expanded,     setExpanded]    = React.useState(false)

  // ── Send state ────────────────────────────────────────────────────────
  const [sending,    setSending]   = React.useState(false)
  const [sendStatus, setSendStatus]= React.useState<'idle' | 'sent' | 'error'>('idle')
  const [sendMsg,    setSendMsg]   = React.useState('')

  // ── Draft state ───────────────────────────────────────────────────────
  const draftIdRef                = React.useRef<string | null>(null)
  const [autoSaveState, setAutoSaveState] = React.useState<AutoSaveState>('idle')
  const draftCount                = React.useMemo(
    () => getDraftsForLead(lead.id).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lead.id, tab]
  )

  // ── Auto-save (debounced) ─────────────────────────────────────────────
  const autoSaver = React.useMemo(() => createAutoSaver(
    lead.id,
    draftIdRef,
    () => setAutoSaveState('saved'),
  ), [lead.id])

  React.useEffect(() => {
    if (!subject.trim() && !body.trim()) return
    setAutoSaveState('saving')
    autoSaver(accountId, subject, body)
  }, [subject, body, accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on lead change
  React.useEffect(() => {
    setSubject(''); setBody(''); setScheduleAt('')
    setSendStatus('idle'); draftIdRef.current = null
    setAutoSaveState('idle')
  }, [lead.id])

  // Apply AI draft when panel opens with pre-filled content
  React.useEffect(() => {
    if (open && initialSubject) { setSubject(initialSubject); setTab('compose') }
    if (open && initialBody)    { setBody(initialBody) }
  }, [open, initialSubject, initialBody])

  // Reset account selection when accounts change
  React.useEffect(() => {
    if (!accountId || !accounts.find((a) => a.id === accountId)) {
      const first = accounts.find((a) => !quotas[a.id]?.at_limit) ?? accounts[0]
      if (first) setAccountId(first.id)
    }
  }, [accounts]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const selectedQuota   = accountId ? quotas[accountId] : null
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
  const canSend  = !!subject.trim() && !!body.trim() && !!accountId && !selectedQuota?.at_limit

  // ── Handlers ──────────────────────────────────────────────────────────
  function handleLoadTemplate(tpl: { subject: string; body: string }) {
    setSubject(tpl.subject)
    setBody(tpl.body)
    setTab('compose')
  }

  function handleLoadDraft(draft: EmailDraft) {
    setAccountId(draft.sending_account_id || accountId)
    setSubject(draft.subject)
    setBody(draft.body)
    draftIdRef.current = draft.id
    setTab('compose')
  }

  function handleManualSaveDraft() {
    if (!subject.trim() && !body.trim()) return
    const saved = saveDraft({
      id:                 draftIdRef.current ?? undefined,
      lead_id:            lead.id,
      sending_account_id: accountId,
      subject,
      body,
    })
    draftIdRef.current = saved.id
    setAutoSaveState('saved')
  }

  function handleClear() {
    setSubject(''); setBody(''); setScheduleAt('')
    draftIdRef.current = null; setAutoSaveState('idle')
  }

  async function handleSend() {
    if (!canSend) return
    setSending(true); setSendStatus('idle')
    try {
      const payload: Record<string, unknown> = {
        lead_id:            lead.id,
        sending_account_id: accountId,
        subject:            subject.trim(),
        body_html:          textToHtml(body),
      }
      if (showSchedule && scheduleAt) {
        payload.scheduled_for = new Date(scheduleAt).toISOString()
      }

      const res  = await fetch('/api/emails/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok && res.status !== 202) {
        setSendStatus('error')
        setSendMsg(data.error ?? 'Send failed. Please try again.')
        return
      }

      setSendStatus('sent')
      setSendMsg(data.status === 'queued'
        ? `Email queued (quota exceeded) — will send at ${data.queued_for ? new Date(data.queued_for).toLocaleString() : 'tomorrow'}.`
        : 'Email sent successfully!'
      )
      onSent?.(data.email_id)
      setSubject(''); setBody(''); draftIdRef.current = null

    } catch (err) {
      setSendStatus('error')
      setSendMsg(String(err))
    } finally {
      setSending(false)
    }
  }

  // ── Keyboard shortcut: Escape to close ───────────────────────────────
  React.useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape' && !sending) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, sending, onClose])

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Email composer"
        aria-modal={open}
        aria-hidden={!open}
        className={cn(
          // Base: fixed right-side drawer
          'fixed bottom-0 right-0 z-40 flex flex-col bg-card',
          'border-l border-border shadow-2xl',
          'transition-all duration-300 ease-in-out',

          // Height: full screen on mobile, full height on desktop
          'top-0',

          // Width: expands when expanded
          expanded
            ? 'w-full sm:w-[680px]'
            : 'w-full sm:w-[420px] lg:w-[460px]',

          // Translate for open/close animation
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >

        {/* ── Panel header ── */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
          {/* To indicator */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {leadName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{leadName}</p>
              <p className="truncate text-xs text-muted-foreground">{lead.email}</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            {/* Expand / collapse */}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={expanded ? 'Collapse panel' : 'Expand panel'}
            >
              {expanded
                ? <Minimize2 className="h-3.5 w-3.5" />
                : <Maximize2 className="h-3.5 w-3.5" />
              }
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex overflow-x-auto border-b border-border scrollbar-hide shrink-0">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap',
                tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {id === 'drafts' && draftCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                  {draftCount}
                </span>
              )}
              {id === 'history' && emails.length > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-bold">
                  {emails.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Content area ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

          {/* ─ COMPOSE ─ */}
          {tab === 'compose' && (
            <div className="flex min-h-0 flex-1 flex-col">

              {/* Sender row */}
              <div className="border-b border-border px-4 py-2.5 shrink-0">
                <AccountPicker
                  accounts={accounts}
                  quotas={quotas}
                  value={accountId}
                  onChange={setAccountId}
                />
              </div>

              {/* Subject row */}
              <div className="flex items-center gap-2 border-b border-border px-4 py-2 shrink-0">
                <span className="shrink-0 text-xs font-medium text-muted-foreground w-12">Subject</span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Your subject line…"
                  className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
                />
              </div>

              {/* Body editor */}
              <BodyEditor
                value={body}
                onChange={setBody}
                className="min-h-0 flex-1"
                minRows={10}
                maxRows={30}
              />

              {/* Schedule row (collapsible) */}
              {showSchedule && (
                <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-4 py-2 shrink-0">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="flex-1 bg-transparent text-xs focus:outline-none text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => { setShowSchedule(false); setScheduleAt('') }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Send status messages */}
              {sendStatus === 'sent' && (
                <div className="flex items-start gap-2 border-t border-border bg-secondary px-4 py-2.5 text-xs text-foreground shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {sendMsg}
                </div>
              )}
              {sendStatus === 'error' && (
                <div className="flex items-start gap-2 border-t border-border bg-secondary px-4 py-2.5 text-xs text-foreground shrink-0">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {sendMsg}
                </div>
              )}

              {/* Auto-save indicator */}
              {autoSaveState !== 'idle' && (
                <div className="flex items-center gap-1 px-4 py-1 text-[10px] text-muted-foreground shrink-0">
                  {autoSaveState === 'saving'
                    ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Saving draft…</>
                    : <><CheckCircle2 className="h-2.5 w-2.5 text-foreground" /> Draft saved</>
                  }
                </div>
              )}

              {/* ── Footer: actions ── */}
              <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/10 px-4 py-3 shrink-0">
                <div className="flex items-center gap-1">
                  {/* Clear */}
                  <button
                    type="button"
                    onClick={handleClear}
                    title="Clear compose"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>

                  {/* Schedule toggle */}
                  <button
                    type="button"
                    onClick={() => setShowSchedule((v) => !v)}
                    title="Schedule for later"
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                      showSchedule
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Calendar className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Save draft */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleManualSaveDraft}
                    disabled={!subject.trim() && !body.trim()}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save draft
                  </Button>

                  {/* Send */}
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleSend}
                    disabled={!canSend || sending}
                  >
                    {sending ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                    ) : showSchedule && scheduleAt ? (
                      <><Calendar className="h-3.5 w-3.5" /> Schedule</>
                    ) : (
                      <><Send className="h-3.5 w-3.5" /> Send</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ─ TEMPLATES ─ */}
          {tab === 'templates' && (
            <div className="flex min-h-0 flex-1 flex-col py-3 overflow-hidden">
              <TemplateBrowser
                onSelect={(tpl) => handleLoadTemplate(tpl)}
              />
            </div>
          )}

          {/* ─ DRAFTS ─ */}
          {tab === 'drafts' && (
            <div className="flex min-h-0 flex-1 flex-col py-3 overflow-hidden">
              <DraftBrowser
                leadId={lead.id}
                currentDraftId={draftIdRef.current}
                onLoad={handleLoadDraft}
              />
            </div>
          )}

          {/* ─ HISTORY ─ */}
          {tab === 'history' && (
            <div className="flex min-h-0 flex-1 flex-col py-3 overflow-hidden">
              <EmailHistoryPanel emails={emails} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Convert plain text → basic HTML ──────────────────────────────────────
function textToHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((https?:\/\/.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}

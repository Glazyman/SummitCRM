'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, ChevronRight, Loader2,
  Users, Mail, Calendar, Rocket, Eye,
  Clock, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SequenceBuilder } from './sequence-builder'
import { estimateCompletion } from '@/lib/campaigns/scheduler'
import type { BuilderStep, WizardStep, BatchOption, AccountOption } from './types'

// ── Wizard step config ────────────────────────────────────────────────────
const WIZARD_STEPS: Array<{ id: WizardStep; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'basics',   label: 'Basics',            icon: Users    },
  { id: 'sequence', label: 'Sequence',           icon: Mail     },
  { id: 'preview',  label: 'Preview',            icon: Eye      },
  { id: 'confirm',  label: 'Confirm & Launch',   icon: Rocket   },
]

const DEFAULT_STEP: BuilderStep = {
  id:               `step-${Date.now()}`,
  step_number:      1,
  subject_template: '',
  body_template:    '',
  delay_days:       0,
  use_ai:           false,
  ai_tone:          'professional',
}

// ── Component ─────────────────────────────────────────────────────────────
interface CampaignBuilderWizardProps {
  batches: BatchOption[]
  accounts: AccountOption[]
}

export function CampaignBuilderWizard({ batches, accounts }: CampaignBuilderWizardProps) {
  const router = useRouter()

  // ── Wizard state ──────────────────────────────────────────────────────
  const [wizardStep, setWizardStep] = React.useState<WizardStep>('basics')
  const [submitting,  setSubmitting] = React.useState(false)
  const [error,       setError]      = React.useState<string | null>(null)

  // ── Basics state ──────────────────────────────────────────────────────
  const [name,        setName]       = React.useState('')
  const [description, setDesc]       = React.useState('')
  const [batchId,     setBatchId]    = React.useState('')
  const [accountId,   setAccountId]  = React.useState('')
  const [startMode,   setStartMode]  = React.useState<'now' | 'scheduled'>('now')
  const [startAt,     setStartAt]    = React.useState('')

  // ── Sequence state ────────────────────────────────────────────────────
  const [steps, setSteps] = React.useState<BuilderStep[]>([{ ...DEFAULT_STEP, id: `step-${Date.now()}` }])

  // ── Preview state ─────────────────────────────────────────────────────
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [previewData,    setPreviewData]    = React.useState<{
    subject: string; body_html: string; to_name: string; to_email: string
  } | null>(null)

  const selectedBatch   = batches.find((b) => b.id === batchId)
  const selectedAccount = accounts.find((a) => a.id === accountId)

  const totalEmails = (selectedBatch?.lead_count ?? 0) * steps.length

  const estimatedEnd = selectedBatch && selectedAccount
    ? estimateCompletion({
        totalLeads:  selectedBatch.lead_count,
        dailyLimit:  50,
        steps:       steps.map((s) => ({ delay_days: s.delay_days })),
        startDate:   startMode === 'scheduled' && startAt ? new Date(startAt) : new Date(),
      })
    : null

  // ── Validation ────────────────────────────────────────────────────────
  const basicsValid = name.trim().length > 0 && batchId && accountId
  const seqValid    = steps.every((s) => s.subject_template.trim() && s.body_template.trim())

  // ── Handlers ──────────────────────────────────────────────────────────
  function goTo(step: WizardStep) { setWizardStep(step); setError(null) }

  async function loadPreview() {
    setPreviewLoading(true)
    const step1 = steps[0]
    setPreviewData({
      subject: step1.subject_template || '(No subject yet)',
      body_html: `<p>${(step1.body_template || 'Add email body content before launch.')
        .replace(/\n/g, '</p><p>')
      }</p>`,
      to_name: 'Real lead preview',
      to_email: 'selected from your batch',
    })
    setPreviewLoading(false)
  }

  React.useEffect(() => {
    if (wizardStep === 'preview') loadPreview()
  }, [wizardStep]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLaunch() {
    if (!basicsValid || !seqValid) return
    setSubmitting(true); setError(null)
    try {
      const payload = {
        name:               name.trim(),
        description:        description.trim() || undefined,
        batch_id:           batchId,
        sending_account_id: accountId,
        scheduled_start:    startMode === 'scheduled' && startAt ? new Date(startAt).toISOString() : null,
        steps:              steps.map((s, i) => ({
          step_number:      i + 1,
          subject_template: s.subject_template,
          body_template:    s.body_template,
          delay_days:       s.delay_days,
          use_ai:           s.use_ai,
          ai_tone:          s.ai_tone,
        })),
      }

      const res  = await fetch('/api/campaigns', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Failed to create campaign')

      // Start the campaign immediately
      const startRes = await fetch(`/api/campaigns/${data.campaign_id}/start`, { method: 'POST' })
      if (!startRes.ok) {
        const startData = await startRes.json()
        throw new Error(startData.error ?? 'Campaign created but failed to start')
      }

      router.push(`/campaigns/${data.campaign_id}`)
    } catch (err) {
      setError(String(err).replace('Error: ', ''))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const currentIdx = WIZARD_STEPS.findIndex((s) => s.id === wizardStep)

  return (
    <div className="mx-auto max-w-2xl space-y-8">

      {/* ── Progress stepper ── */}
      <div className="flex items-center justify-between">
        {WIZARD_STEPS.map((ws, i) => {
          const isDone    = i < currentIdx
          const isCurrent = i === currentIdx
          const Icon      = ws.icon
          return (
            <React.Fragment key={ws.id}>
              <button
                type="button"
                onClick={() => isDone ? goTo(ws.id) : undefined}
                disabled={!isDone}
                className={cn(
                  'flex flex-col items-center gap-1.5 text-xs font-medium transition-colors',
                  isCurrent ? 'text-primary' : isDone ? 'cursor-pointer text-muted-foreground hover:text-foreground' : 'cursor-default text-muted-foreground/40'
                )}
              >
                <div className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all',
                  isCurrent ? 'border-primary bg-primary/10' : isDone ? 'border-primary/40 bg-primary/5' : 'border-muted bg-background'
                )}>
                  {isDone
                    ? <CheckCircle2 className="h-4 w-4 text-primary" />
                    : <Icon className={cn('h-4 w-4', isCurrent ? 'text-primary' : 'text-muted-foreground/40')} />
                  }
                </div>
                <span className="hidden sm:block">{ws.label}</span>
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={cn('h-px flex-1 mx-2', i < currentIdx ? 'bg-primary/40' : 'bg-muted')} />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* ── Step content ── */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">

        {/* ─ BASICS ─ */}
        {wizardStep === 'basics' && (
          <>
            <div>
              <h2 className="text-lg font-semibold">Campaign basics</h2>
              <p className="mt-1 text-sm text-muted-foreground">Name your campaign, pick a batch and a sending account.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="camp-name">Campaign name *</Label>
                <Input
                  id="camp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q2 SaaS Founder Outreach"
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="camp-desc">Description (optional)</Label>
                <Input
                  id="camp-desc"
                  value={description}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Targeting SaaS founders from the May import"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Target batch *</Label>
                <div className="grid gap-2">
                  {batches.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBatchId(b.id)}
                      className={cn(
                        'flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all',
                        batchId === b.id ? 'border-primary bg-primary/5' : 'border-border hover:border-border/60 hover:bg-muted/30'
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Users className="h-3 w-3" /> {b.lead_count.toLocaleString()} leads
                        </p>
                      </div>
                      {batchId === b.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Sending account *</Label>
                <div className="grid gap-2">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAccountId(a.id)}
                      className={cn(
                        'flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all',
                        accountId === a.id ? 'border-primary bg-primary/5' : 'border-border hover:border-border/60 hover:bg-muted/30'
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium">{a.from_name}</p>
                        <p className="text-xs text-muted-foreground">{a.from_email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="h-1 w-16 rounded-full bg-muted">
                            <div
                              className={cn('h-full rounded-full', a.quota_percent >= 80 ? 'bg-secondary' : 'bg-secondary')}
                              style={{ width: `${a.quota_percent}%` }}
                            />
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{a.quota_remaining} sends left today</p>
                        </div>
                        {accountId === a.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start time */}
              <div className="space-y-2">
                <Label>Start time</Label>
                <div className="flex gap-2">
                  {(['now', 'scheduled'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setStartMode(m)}
                      className={cn(
                        'flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all',
                        startMode === m ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted/30'
                      )}
                    >
                      {m === 'now' ? 'Launch now' : 'Schedule'}
                    </button>
                  ))}
                </div>
                {startMode === 'scheduled' && (
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
              </div>
            </div>
          </>
        )}

        {/* ─ SEQUENCE ─ */}
        {wizardStep === 'sequence' && (
          <>
            <div>
              <h2 className="text-lg font-semibold">Email sequence</h2>
              <p className="mt-1 text-sm text-muted-foreground">Build your multi-step drip. Each step can have a delay and optional AI personalisation.</p>
            </div>
            <SequenceBuilder steps={steps} onChange={setSteps} />
          </>
        )}

        {/* ─ PREVIEW ─ */}
        {wizardStep === 'preview' && (
          <>
            <div>
              <h2 className="text-lg font-semibold">Preview email</h2>
              <p className="mt-1 text-sm text-muted-foreground">Step 1 preview using your template. Merge variables resolve against real leads at send time.</p>
            </div>

            {previewLoading ? (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm">Rendering preview…</p>
              </div>
            ) : previewData ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3 text-sm">
                  <div className="flex gap-2 text-muted-foreground">
                    <span className="w-10 shrink-0 font-medium">To:</span>
                  <span>{previewData.to_name} ({previewData.to_email})</span>
                  </div>
                  <div className="flex gap-2 text-muted-foreground">
                    <span className="w-10 shrink-0 font-medium">From:</span>
                    <span>{selectedAccount?.from_name} &lt;{selectedAccount?.from_email}&gt;</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-10 shrink-0 text-sm font-medium text-muted-foreground">Sub:</span>
                    <span className="font-semibold">{previewData.subject}</span>
                  </div>
                </div>

                <div
                  className="rounded-xl border border-border bg-background p-5 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: previewData.body_html }}
                />

                <p className="text-xs text-muted-foreground">
                  No demo contact data is used. Actual merged content will vary per real lead in the selected batch.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                Preview unavailable
              </div>
            )}
          </>
        )}

        {/* ─ CONFIRM ─ */}
        {wizardStep === 'confirm' && (
          <>
            <div>
              <h2 className="text-lg font-semibold">Confirm &amp; launch</h2>
              <p className="mt-1 text-sm text-muted-foreground">Review your campaign before it goes live.</p>
            </div>

            <div className="space-y-3">
              {/* Summary cards */}
              {[
                { icon: <Users className="h-4 w-4 text-foreground" />,   label: 'Target leads',   value: selectedBatch?.lead_count.toLocaleString() ?? '—' },
                { icon: <Mail className="h-4 w-4 text-foreground" />,  label: 'Total emails',   value: totalEmails.toLocaleString() },
                { icon: <Clock className="h-4 w-4 text-foreground" />,  label: 'Sequence steps', value: `${steps.length} step${steps.length > 1 ? 's' : ''}` },
                { icon: <Rocket className="h-4 w-4 text-foreground" />, label: 'Sending account', value: selectedAccount?.from_email ?? '—' },
                { icon: <Calendar className="h-4 w-4 text-gray-500" />, label: 'Est. completion',
                  value: estimatedEnd ? estimatedEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {icon}
                    {label}
                  </div>
                  <span className="text-sm font-semibold">{value}</span>
                </div>
              ))}
            </div>

            {/* Anti-spam notice */}
            <div className="rounded-xl border border-border bg-secondary px-4 py-3 text-xs text-foreground space-y-1">
              <p className="font-semibold">Anti-spam safeguards active</p>
              <ul className="space-y-0.5 list-disc list-inside text-foreground">
                <li>Max 50 emails/day per account — overflow queued to next day</li>
                <li>Sends spread 08:00–18:00 UTC with random timing jitter</li>
                <li>3–8 second delay between consecutive sends</li>
                <li>Reply/unsubscribe skips all remaining steps for that lead</li>
              </ul>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </>
        )}

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={() => {
              const prev = WIZARD_STEPS[currentIdx - 1]
              if (prev) goTo(prev.id)
              else router.push('/campaigns')
            }}
          >
            {currentIdx === 0 ? 'Cancel' : 'Back'}
          </Button>

          {wizardStep !== 'confirm' ? (
            <Button
              onClick={() => {
                const next = WIZARD_STEPS[currentIdx + 1]
                if (next) goTo(next.id)
              }}
              disabled={
                (wizardStep === 'basics' && !basicsValid) ||
                (wizardStep === 'sequence' && !seqValid)
              }
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleLaunch}
              disabled={submitting}
              className="gap-2"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Launching…</>
                : <><Rocket className="h-4 w-4" /> {startMode === 'scheduled' ? 'Schedule campaign' : 'Launch campaign'}</>
              }
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Play, Pause, XCircle, BarChart2,
  Mail, List, AlertCircle, Loader2,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CampaignStatusBadge } from '@/components/campaigns/campaign-status-badge'
import { CampaignStatsCards, CampaignProgress } from '@/components/campaigns/campaign-stats-cards'
import { CampaignEmailsTable } from '@/components/campaigns/campaign-emails-table'
import type { Campaign, CampaignStep, CampaignEmailRow } from '@/components/campaigns/types'

type Tab = 'overview' | 'emails' | 'analytics'

// ── Component ─────────────────────────────────────────────────────────────
interface CampaignDetailClientProps {
  initialCampaign: Campaign | null
  initialSteps: CampaignStep[]
  initialEmails: CampaignEmailRow[]
}

export function CampaignDetailClient({ initialCampaign, initialSteps, initialEmails }: CampaignDetailClientProps) {
  const [tab, setTab]         = React.useState<Tab>('overview')
  const [campaign, setCampaign] = React.useState<Campaign | null>(initialCampaign)
  const [actionLoading, setActionLoading] = React.useState(false)
  const [actionError,   setActionError]   = React.useState<string | null>(null)

  if (!campaign) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
        <p className="text-sm">Campaign not found.</p>
        <Link href="/campaigns" className="text-sm text-primary hover:underline">← Back to campaigns</Link>
      </div>
    )
  }

  async function handleAction(action: 'pause' | 'resume' | 'cancel') {
    setActionLoading(true); setActionError(null)
    try {
      const res  = await fetch(`/api/campaigns/${campaign!.id}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      const statusMap: Record<string, string> = { pause: 'paused', resume: 'running', cancel: 'cancelled' }
      setCampaign((prev) => prev ? { ...prev, status: statusMap[action] as Campaign['status'] } : prev)
    } catch (err) {
      setActionError(String(err).replace('Error: ', ''))
    } finally {
      setActionLoading(false)
    }
  }

  const canPause  = campaign.status === 'running'
  const canResume = campaign.status === 'paused'
  const canCancel = ['running', 'paused', 'scheduled'].includes(campaign.status)

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <Link
          href="/campaigns"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All campaigns
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold">{campaign.name}</h1>
              <CampaignStatusBadge status={campaign.status} dot />
            </div>
            {campaign.description && (
              <p className="text-sm text-muted-foreground">{campaign.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canPause && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-foreground hover:text-foreground"
                onClick={() => handleAction('pause')}
                disabled={actionLoading}
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>
            )}
            {canResume && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-foreground hover:text-foreground"
                onClick={() => handleAction('resume')}
                disabled={actionLoading}
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-foreground hover:text-foreground"
                onClick={() => handleAction('cancel')}
                disabled={actionLoading}
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Cancel
              </Button>
            )}
          </div>
        </div>

        {actionError && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm text-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {actionError}
          </div>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-border">
        {([
          { id: 'overview',   label: 'Overview',   Icon: BarChart2 },
          { id: 'emails',     label: 'Emails',     Icon: Mail     },
          { id: 'analytics',  label: 'Analytics',  Icon: List     },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-5 py-2.5 text-sm font-medium transition-colors',
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <CampaignStatsCards campaign={campaign} />
          <CampaignProgress campaign={campaign} />

          {/* Sequence steps */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">Sequence steps</h3>
            <div className="space-y-2">
              {initialSteps.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No sequence steps have been created for this campaign.
                </p>
              ) : initialSteps.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {step.step_number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{step.subject_template}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      {idx === 0 ? (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Sends immediately</span>
                      ) : (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> After {step.delay_days} days</span>
                      )}
                      {step.use_ai && (
                        <span className="rounded-full bg-secondary px-1.5 py-px text-[9px] font-semibold text-foreground">
                          AI
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── EMAILS ── */}
      {tab === 'emails' && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Per-lead email status</h3>
            <span className="text-xs text-muted-foreground">{initialEmails.length.toLocaleString()} emails</span>
          </div>
          <CampaignEmailsTable emails={initialEmails} />
        </div>
      )}

      {/* ── ANALYTICS ── */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          <CampaignStatsCards campaign={campaign} />

          {/* Per-step breakdown */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">Per-step performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Step', 'Subject', 'Sent', 'Open %', 'Click %', 'Reply %'].map((h) => (
                      <th key={h} className="pb-2.5 pr-5 text-left text-xs font-semibold text-muted-foreground last:pr-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {initialSteps.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No sequence performance yet.
                      </td>
                    </tr>
                  )}
                  {initialSteps.map((step) => {
                    const stepEmails = initialEmails.filter((email) => email.step_number === step.step_number)
                    const sent = stepEmails.filter((email) => ['sent', 'opened', 'clicked', 'replied', 'bounced'].includes(email.status)).length
                    const opened = stepEmails.filter((email) => email.opened_at).length
                    const clicked = stepEmails.filter((email) => email.clicked_at).length
                    const replied = stepEmails.filter((email) => email.replied_at).length
                    const p = (n: number) => sent > 0 ? `${Math.round((n / sent) * 100)}%` : '—'
                    return (
                      <tr key={step.id} className="hover:bg-muted/20">
                        <td className="py-3 pr-5"><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">#{step.step_number}</span></td>
                        <td className="py-3 pr-5 max-w-[180px]"><p className="truncate text-xs">{step.subject_template}</p></td>
                        <td className="py-3 pr-5 tabular-nums text-xs">{sent.toLocaleString()}</td>
                        <td className="py-3 pr-5 text-xs text-foreground">{p(opened)}</td>
                        <td className="py-3 pr-5 text-xs text-foreground">{p(clicked)}</td>
                        <td className="py-3 text-xs text-foreground">{p(replied)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Full analytics with charts are in the Analytics section. <Link href="/analytics" className="text-primary hover:underline">Open Analytics →</Link>
          </p>
        </div>
      )}
    </div>
  )
}

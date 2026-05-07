'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Play, Pause, XCircle, BarChart2,
  Mail, List, AlertCircle, Loader2, RefreshCw,
  Clock, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CampaignStatusBadge } from '@/components/campaigns/campaign-status-badge'
import { CampaignStatsCards, CampaignProgress } from '@/components/campaigns/campaign-stats-cards'
import { CampaignEmailsTable } from '@/components/campaigns/campaign-emails-table'
import { MOCK_CAMPAIGNS } from '@/components/campaigns/mock-data'
import type { Campaign, CampaignStep, CampaignAnalytics, CampaignEmailRow } from '@/components/campaigns/types'

type Tab = 'overview' | 'emails' | 'analytics'

// ── Mock step data ────────────────────────────────────────────────────────
const MOCK_STEPS: CampaignStep[] = [
  { id: 's1', campaign_id: 'camp-1', step_number: 1, subject_template: 'Quick question about {{company}}', body_template: '', delay_days: 0,  use_ai: false, ai_tone: 'professional', created_at: '' },
  { id: 's2', campaign_id: 'camp-1', step_number: 2, subject_template: 'Following up, {{first_name}}',     body_template: '', delay_days: 3,  use_ai: false, ai_tone: 'professional', created_at: '' },
  { id: 's3', campaign_id: 'camp-1', step_number: 3, subject_template: 'Last chance',                      body_template: '', delay_days: 7,  use_ai: true,  ai_tone: 'casual',        created_at: '' },
]

const MOCK_EMAILS: CampaignEmailRow[] = Array.from({ length: 12 }, (_, i) => ({
  email_id:    `em-${i}`,
  lead_id:     `lead-${i}`,
  lead_name:   ['James Holloway', 'Sarah Chen', 'Mike Torres', 'Priya Patel', 'Tom Wilson', 'Lisa Kim', null][i % 7],
  lead_email:  `lead${i}@example.com`,
  step_number: (i % 3) + 1,
  subject:     ['Quick question about Acme', 'Following up, James', 'Last chance'][i % 3],
  status:      ['sent', 'opened', 'clicked', 'replied', 'queued', 'bounced', 'sent', 'opened', 'queued', 'replied', 'sent', 'failed'][i],
  sent_at:     i < 9 ? new Date(Date.now() - i * 3_600_000).toISOString() : null,
  opened_at:   ['opened', 'clicked', 'replied'].includes(['sent', 'opened', 'clicked', 'replied', 'queued', 'bounced', 'sent', 'opened', 'queued', 'replied', 'sent', 'failed'][i]) ? new Date(Date.now() - i * 1_800_000).toISOString() : null,
  clicked_at:  ['clicked', 'replied'].includes(['sent', 'opened', 'clicked', 'replied', 'queued', 'bounced', 'sent', 'opened', 'queued', 'replied', 'sent', 'failed'][i]) ? new Date().toISOString() : null,
  replied_at:  ['replied'].includes(['sent', 'opened', 'clicked', 'replied', 'queued', 'bounced', 'sent', 'opened', 'queued', 'replied', 'sent', 'failed'][i]) ? new Date().toISOString() : null,
  bounced_at:  ['bounced'].includes(['sent', 'opened', 'clicked', 'replied', 'queued', 'bounced', 'sent', 'opened', 'queued', 'replied', 'sent', 'failed'][i]) ? new Date().toISOString() : null,
}))

// ── Component ─────────────────────────────────────────────────────────────
interface CampaignDetailClientProps {
  campaignId: string
}

export function CampaignDetailClient({ campaignId }: CampaignDetailClientProps) {
  const [tab, setTab]         = React.useState<Tab>('overview')
  const [campaign, setCampaign] = React.useState<Campaign | null>(
    () => MOCK_CAMPAIGNS.find((c) => c.id === campaignId) ?? MOCK_CAMPAIGNS[0]
  )
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
                className="gap-1.5 text-amber-600 hover:text-amber-700"
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
                className="gap-1.5 text-emerald-600 hover:text-emerald-700"
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
                className="gap-1.5 text-red-500 hover:text-red-600"
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
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200/50 bg-red-50/80 px-4 py-2.5 text-sm text-red-700 dark:border-red-800/30 dark:bg-red-900/10 dark:text-red-400">
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
              {MOCK_STEPS.map((step, idx) => (
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
                        <span className="rounded-full bg-violet-100 px-1.5 py-px text-[9px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
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
            <span className="text-xs text-muted-foreground">{MOCK_EMAILS.length.toLocaleString()} emails</span>
          </div>
          <CampaignEmailsTable emails={MOCK_EMAILS} />
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
                  {MOCK_STEPS.map((step) => {
                    const sent    = Math.floor(campaign.emails_sent / MOCK_STEPS.length)
                    const opened  = Math.floor(campaign.emails_opened / MOCK_STEPS.length)
                    const clicked = Math.floor(campaign.emails_clicked / MOCK_STEPS.length)
                    const replied = Math.floor(campaign.emails_replied / MOCK_STEPS.length)
                    const p = (n: number) => sent > 0 ? `${Math.round((n / sent) * 100)}%` : '—'
                    return (
                      <tr key={step.id} className="hover:bg-muted/20">
                        <td className="py-3 pr-5"><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">#{step.step_number}</span></td>
                        <td className="py-3 pr-5 max-w-[180px]"><p className="truncate text-xs">{step.subject_template}</p></td>
                        <td className="py-3 pr-5 tabular-nums text-xs">{sent.toLocaleString()}</td>
                        <td className="py-3 pr-5 text-xs text-blue-500">{p(opened)}</td>
                        <td className="py-3 pr-5 text-xs text-teal-500">{p(clicked)}</td>
                        <td className="py-3 text-xs text-emerald-500">{p(replied)}</td>
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

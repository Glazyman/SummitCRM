import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CampaignDetailClient } from './campaign-detail-client'
import { createClient } from '@/lib/supabase/server'
import type { Campaign, CampaignEmailRow, CampaignStep } from '@/components/campaigns/types'

export const metadata: Metadata = { title: 'Campaign Detail' }

type Props = { params: Promise<{ id: string }> }

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = (await createClient()) as any

  const [campaignResult, stepsResult, emailsResult] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, workspace_id, created_by, name, description, batch_id, sending_account_id, status, scheduled_start, started_at, completed_at, paused_at, total_leads, emails_sent, emails_opened, emails_clicked, emails_replied, emails_bounced, created_at, updated_at')
      .eq('id', id)
      .single(),
    supabase
      .from('campaign_sequence_steps')
      .select('id, campaign_id, step_number, subject_template, body_template, delay_days, use_ai, ai_tone, created_at')
      .eq('campaign_id', id)
      .order('step_number', { ascending: true }),
    supabase
      .from('emails')
      .select('id, lead_id, subject, status, sent_at, opened_at, clicked_at, replied_at, bounced_at, step_number, leads(first_name, last_name, email)')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!campaignResult.data) notFound()

  const emails = ((emailsResult.data ?? []) as Array<{
    id: string
    lead_id: string
    subject: string
    status: string
    sent_at: string | null
    opened_at: string | null
    clicked_at: string | null
    replied_at: string | null
    bounced_at: string | null
    step_number: number | null
    leads: { first_name: string | null; last_name: string | null; email: string } | null
  }>).map((email): CampaignEmailRow => ({
    email_id: email.id,
    lead_id: email.lead_id,
    lead_name: email.leads ? [email.leads.first_name, email.leads.last_name].filter(Boolean).join(' ') || null : null,
    lead_email: email.leads?.email ?? '',
    step_number: email.step_number ?? 1,
    subject: email.subject,
    status: email.status,
    sent_at: email.sent_at,
    opened_at: email.opened_at,
    clicked_at: email.clicked_at,
    replied_at: email.replied_at,
    bounced_at: email.bounced_at,
  }))

  return (
    <CampaignDetailClient
      initialCampaign={campaignResult.data as Campaign}
      initialSteps={(stepsResult.data ?? []) as CampaignStep[]}
      initialEmails={emails}
    />
  )
}

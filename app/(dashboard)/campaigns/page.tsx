import type { Metadata } from 'next'
import { CampaignsClient } from './campaigns-client'
import { createClient } from '@/lib/supabase/server'
import type { Campaign } from '@/components/campaigns/types'

export const metadata: Metadata = { title: 'Campaigns' }

export default async function CampaignsPage() {
  let campaigns: Campaign[] = []

  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('campaigns')
      .select('id, workspace_id, created_by, name, description, batch_id, sending_account_id, status, scheduled_start, started_at, completed_at, paused_at, total_leads, emails_sent, emails_opened, emails_clicked, emails_replied, emails_bounced, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(200)

    campaigns = (data ?? []) as Campaign[]
  } catch {
    campaigns = []
  }

  return <CampaignsClient initialCampaigns={campaigns} />
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { CampaignBuilderWizard } from '@/components/campaigns/campaign-builder-wizard'
import { createClient } from '@/lib/supabase/server'
import type { AccountOption, BatchOption } from '@/components/campaigns/types'

export const metadata: Metadata = { title: 'New Campaign' }

export default async function NewCampaignPage() {
  const supabase = (await createClient()) as any
  const { data: { user } } = await supabase.auth.getUser()
  let batches: BatchOption[] = []
  let accounts: AccountOption[] = []

  if (user) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string } | null; error: unknown }

    if (member?.workspace_id) {
      const [batchesResult, accountsResult] = await Promise.all([
        supabase
          .from('lead_batches')
          .select('id, name, lead_count')
          .eq('workspace_id', member.workspace_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('sending_accounts_safe')
          .select('id, name, from_email, from_name, daily_limit, emails_sent_today')
          .eq('workspace_id', member.workspace_id)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
      ])

      batches = (batchesResult.data ?? []) as BatchOption[]
      accounts = ((accountsResult.data ?? []) as Array<{
        id: string
        name: string
        from_email: string
        from_name: string | null
        daily_limit: number
        emails_sent_today: number
      }>).map((account) => {
        const remaining = Math.max(account.daily_limit - account.emails_sent_today, 0)
        return {
          id: account.id,
          name: account.name,
          from_email: account.from_email,
          from_name: account.from_name ?? account.name,
          quota_remaining: remaining,
          quota_percent: account.daily_limit > 0 ? Math.round((account.emails_sent_today / account.daily_limit) * 100) : 0,
        }
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/campaigns"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to campaigns
        </Link>
        <h1 className="text-xl font-semibold">Create campaign</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Build a multi-step email sequence for a lead batch.
        </p>
      </div>
      <CampaignBuilderWizard batches={batches} accounts={accounts} />
    </div>
  )
}

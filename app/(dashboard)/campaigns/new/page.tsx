import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { CampaignBuilderWizard } from '@/components/campaigns/campaign-builder-wizard'

export const metadata: Metadata = { title: 'New Campaign' }

export default function NewCampaignPage() {
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
      <CampaignBuilderWizard />
    </div>
  )
}

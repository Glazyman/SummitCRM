import type { Metadata } from 'next'
import { CampaignsClient } from './campaigns-client'
import { MOCK_CAMPAIGNS } from '@/components/campaigns/mock-data'

export const metadata: Metadata = { title: 'Campaigns' }

export default function CampaignsPage() {
  return <CampaignsClient initialCampaigns={MOCK_CAMPAIGNS} />
}

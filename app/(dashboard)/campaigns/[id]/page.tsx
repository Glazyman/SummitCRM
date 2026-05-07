import type { Metadata } from 'next'
import { CampaignDetailClient } from './campaign-detail-client'

export const metadata: Metadata = { title: 'Campaign Detail' }

type Props = { params: Promise<{ id: string }> }

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params
  return <CampaignDetailClient campaignId={id} />
}

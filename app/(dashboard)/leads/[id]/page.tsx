import { Suspense }      from 'react'
import { notFound }      from 'next/navigation'
import { Spinner }       from '@/components/ui/spinner'
import LeadDetailClient  from './lead-detail-client'
import {
  MOCK_LEAD,
  MOCK_ACTIVITY,
  MOCK_EMAILS,
  MOCK_FOLLOW_UPS,
  MOCK_TEAM,
} from '@/components/leads/detail/mock-detail-data'
import type { LeadDetail } from '@/components/leads/detail/types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params

  // ── Data fetching (replace with real Supabase queries) ──────────────
  //
  // const supabase = await createServerClient(cookies())
  // const [{ data: lead }, { data: activity }, { data: emails }, { data: followUps }] =
  //   await Promise.all([
  //     supabase.from('leads').select('*, batch:batches(name), assigned:workspace_members(name)').eq('id', id).single(),
  //     supabase.from('activity_logs').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
  //     supabase.from('emails').select('*').eq('lead_id', id).order('sent_at', { ascending: false }),
  //     supabase.from('follow_ups').select('*').eq('lead_id', id).order('due_at', { ascending: true }),
  //   ])
  // if (!lead) notFound()

  // ── Use mock data for frontend dev ───────────────────────────────────
  // When the id is not the mock id, still render the page (demo mode).
  const lead: LeadDetail = { ...MOCK_LEAD, id }

  // Mock: current user context (would come from Supabase session in production)
  const currentUserId = 'u1'
  const isAdmin       = true

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      }
    >
      <LeadDetailClient
        lead={lead}
        activity={MOCK_ACTIVITY}
        emails={MOCK_EMAILS}
        followUps={MOCK_FOLLOW_UPS}
        teamMembers={MOCK_TEAM}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />
    </Suspense>
  )
}

// Generate metadata
export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const lead = MOCK_LEAD
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email
  return {
    title: `${name} · Lead Detail`,
  }
}

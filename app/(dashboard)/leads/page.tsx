import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient }      from '@/lib/supabase/server'
import { LeadsClient }       from './leads-client'
import { MOCK_LEADS, MOCK_BATCHES, MOCK_TEAM } from '@/components/leads/mock-data'
import { Spinner } from '@/components/ui/spinner'

export const metadata: Metadata = { title: 'Leads' }

export default async function LeadsPage() {
  // ── Auth + workspace ───────────────────────────────────────────────────
  // Defaults are conservative: no admin access, anonymous user
  let isAdmin       = false
  let currentUserId = ''

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      currentUserId = user.id
      // Use DB member row as authoritative source — not JWT claims which can be stale
      const { data: member } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single() as { data: { role: string } | null; error: unknown }

      const role = member?.role ?? 'rep'
      isAdmin    = ['super_admin', 'admin', 'manager'].includes(role)
    }
  } catch {
    // Graceful degradation: show leads in read-only mode
  }

  // ── Data ───────────────────────────────────────────────────────────────
  // In production, replace with real Supabase queries:
  //
  //   const workspaceId = user?.app_metadata?.workspace_id
  //   const { data: leads } = await supabase
  //     .from('leads')
  //     .select('*, lead_batches(name), workspace_members!assigned_to(full_name)')
  //     .eq('workspace_id', workspaceId)
  //     .is('deleted_at', null)
  //     .order('created_at', { ascending: false })
  //     .limit(1000)
  //
  const leads      = MOCK_LEADS
  const batches    = MOCK_BATCHES.map((b) => ({ id: b.id, name: b.name }))
  const teamMembers = MOCK_TEAM.map((m) => ({ id: m.id, name: m.name }))

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    }>
      <LeadsClient
        initialLeads={leads}
        batches={batches}
        teamMembers={teamMembers}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
      />
    </Suspense>
  )
}

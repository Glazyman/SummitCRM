import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ImportPageClient } from './import-page-client'

export const metadata: Metadata = { title: 'Import Leads' }

export default async function ImportPage() {
  const supabase    = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user?.id ?? '')
    .eq('is_active', true)
    .single() as { data: { workspace_id: string } | null; error: unknown }

  const workspaceId = memberData?.workspace_id

  const [batchesResult, membersResult] = await Promise.all([
    workspaceId
      ? supabase
          .from('lead_batches')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false }) as unknown as { data: { id: string; name: string }[] | null }
      : { data: [] as { id: string; name: string }[] },

    workspaceId
      ? (adminClient as any)
          .from('workspace_members')
          .select('user_id')
          .eq('workspace_id', workspaceId)
          .eq('is_active', true) as { data: { user_id: string }[] | null }
      : { data: [] as { user_id: string }[] },
  ])

  const memberIds = (membersResult.data ?? []).map((m: { user_id: string }) => m.user_id)
  const { data: usersData } = await adminClient.auth.admin.listUsers()
  const usersById = new Map(
    (usersData?.users ?? [])
      .filter(u => memberIds.includes(u.id))
      .map(u => [u.id, (u.user_metadata?.full_name as string | undefined) ?? u.email ?? u.id])
  )

  const teamMembers = memberIds.map(id => ({ id, name: usersById.get(id) ?? id }))

  const formattedBatches = (batchesResult.data ?? []).map(b => ({
    id: b.id,
    name: b.name,
    leadCount: 0,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/leads" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Leads
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Leads</h1>
        <p className="mt-1 text-muted-foreground">
          Upload a CSV or Excel file to bulk-import leads into your workspace.
        </p>
      </div>

      <ImportPageClient batches={formattedBatches} teamMembers={teamMembers} />
    </div>
  )
}

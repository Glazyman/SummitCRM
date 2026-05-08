import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ImportPageClient } from './import-page-client'

export const metadata: Metadata = { title: 'Import Leads' }

export default async function ImportPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch existing batches for the workspace
  const { data: memberData } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user?.id ?? '')
    .eq('is_active', true)
    .single() as { data: { workspace_id: string } | null; error: unknown }

  const workspaceId = memberData?.workspace_id

  const { data: batches } = workspaceId
    ? await supabase
        .from('lead_batches')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false }) as unknown as {
          data: { id: string; name: string }[] | null
        }
    : { data: [] as { id: string; name: string }[] }

  const formattedBatches = (batches ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    leadCount: 0,
  }))

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Link
          href="/leads"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
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

      <ImportPageClient batches={formattedBatches} />
    </div>
  )
}

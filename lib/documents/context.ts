/**
 * Shared admin-context + document loader for the documents sub-routes
 * (duplicate, replace). Mirrors the inline gate in /api/documents routes:
 * resolves the caller's active workspace and requires admin+.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiUnauthorized, apiForbidden } from '@/lib/utils/api'

export const DOCUMENTS_BUCKET = 'documents'

type AdminClient = ReturnType<typeof createAdminClient>

export type DocRecord = {
  id: string
  name: string
  description: string | null
  file_path: string
  mime_type: string | null
  size_bytes: number | null
}

export async function requireDocumentAdmin() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: apiUnauthorized() }

  const admin = createAdminClient()
  const { data: member } = await (admin as any)
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: string } | null }

  if (!member) return { error: apiForbidden('User is not an active member of any workspace') }
  if (!['admin', 'super_admin'].includes(member.role)) return { error: apiForbidden() }
  return { user, admin, workspaceId: member.workspace_id }
}

export async function loadDocument(admin: AdminClient, workspaceId: string, id: string): Promise<DocRecord | null> {
  const { data } = await (admin as any)
    .from('documents')
    .select('id, name, description, file_path, mime_type, size_bytes')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single() as { data: DocRecord | null }
  return data
}

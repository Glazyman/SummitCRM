/**
 * /api/documents/[id]
 *
 *   GET    — return a short-lived signed URL for the file.
 *            ?download=1 forces a download (Content-Disposition: attachment
 *            with the document's display name); otherwise the URL opens inline
 *            (PDFs preview in the browser, other types download anyway).
 *   DELETE — remove the storage object and the metadata row.
 *
 * Auth: admin+ only.
 */
import { NextRequest } from 'next/server'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiSuccess, apiError, apiUnauthorized, apiForbidden, apiNotFound, apiServerError } from '@/lib/utils/api'

const BUCKET = 'documents'
type Params = { params: Promise<{ id: string }> }

async function requireAdmin() {
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

/** Fetch a document scoped to the caller's workspace. */
async function loadDoc(admin: ReturnType<typeof createAdminClient>, workspaceId: string, id: string) {
  const { data } = await (admin as any)
    .from('documents')
    .select('id, name, file_path, mime_type')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .single() as { data: { id: string; name: string; file_path: string; mime_type: string | null } | null }
  return data
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin()
    if ('error' in ctx) return ctx.error
    const { admin, workspaceId } = ctx
    const { id } = await params

    const doc = await loadDoc(admin, workspaceId, id)
    if (!doc) return apiNotFound('Document')

    const forceDownload = request.nextUrl.searchParams.get('download') === '1'
    // Give the downloaded file a sensible name + extension.
    const ext = doc.file_path.includes('.') ? '.' + doc.file_path.split('.').pop() : ''
    const downloadName = /\.[^.]+$/.test(doc.name) ? doc.name : doc.name + ext

    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, 120, forceDownload ? { download: downloadName } : undefined)

    if (error || !data) return apiServerError(error)
    return apiSuccess({ url: data.signedUrl })
  } catch (err) {
    return apiServerError(err)
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin()
    if ('error' in ctx) return ctx.error
    const { admin, workspaceId } = ctx
    const { id } = await params

    const doc = await loadDoc(admin, workspaceId, id)
    if (!doc) return apiNotFound('Document')

    await admin.storage.from(BUCKET).remove([doc.file_path])
    const { error } = await (admin as any).from('documents').delete().eq('id', id).eq('workspace_id', workspaceId)
    if (error) return apiServerError(error)

    return apiSuccess({ id })
  } catch (err) {
    return apiServerError(err)
  }
}

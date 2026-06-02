import { redirect } from 'next/navigation'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DocxEditorClient } from './docx-editor-client'

export const metadata = { title: 'Edit document — Summit CRM' }

type Params = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mode?: string }>
}

export default async function DocxEditPage({ params, searchParams }: Params) {
  const { id } = await params
  const { mode } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: string } | null }

  if (!member || !['admin', 'super_admin'].includes(member.role)) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: doc } = await (admin as any)
    .from('documents')
    .select('id, name, file_path')
    .eq('id', id)
    .eq('workspace_id', member.workspace_id)
    .single() as { data: { id: string; name: string; file_path: string } | null }

  if (!doc) redirect('/documents')

  // In-browser content editing only applies to Word files.
  const ext = (doc.file_path.split('.').pop() ?? '').toLowerCase()
  if (!['docx', 'doc'].includes(ext)) redirect('/documents')

  return (
    <DocxEditorClient
      docId={doc.id}
      docName={doc.name}
      fileExt={ext}
      initialMode={mode === 'edit' ? 'editing' : 'viewing'}
    />
  )
}

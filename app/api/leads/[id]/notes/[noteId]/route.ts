import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

// Uses admin client for write operations so RLS author-check never blocks
// a legitimate server-validated delete (auth is verified via session before use).

type Params = { params: Promise<{ id: string; noteId: string }> }

const updateNoteSchema = z.object({
  content: z.string().trim().min(1).max(5000),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: leadId, noteId } = await params
    const cookieStore = await cookies()
    const supabase = (await createServerClient(cookieStore)) as unknown as ReturnType<typeof createAdminClient>

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const body = await req.json()
    const parsed = updateNoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const { data: note, error } = await supabase
      .from('notes')
      .update({ content: parsed.data.content })
      .eq('id', noteId)
      .eq('lead_id', leadId)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .select('id, lead_id, author_id, content, created_at, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

    return NextResponse.json({ note })
  } catch (err) {
    console.error('[PATCH /api/leads/[id]/notes/[noteId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id: leadId, noteId } = await params
    const cookieStore = await cookies()
    const supabase = (await createServerClient(cookieStore)) as unknown as ReturnType<typeof createAdminClient>

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const { data: member } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    // Verify ownership: only the author or an admin/manager may delete
    const { data: existingNote } = await (admin as any)
      .from('notes')
      .select('id, author_id')
      .eq('id', noteId)
      .eq('lead_id', leadId)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .single() as { data: { id: string; author_id: string } | null }

    if (!existingNote) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

    const isAdmin = ['admin', 'super_admin'].includes(member.role)
    if (existingNote.author_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Cannot delete another user\'s note' }, { status: 403 })
    }

    const { error } = await (admin as any)
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', noteId)
      .eq('workspace_id', member.workspace_id)

    if (error) return NextResponse.json({ error: (error as any).message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/leads/[id]/notes/[noteId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

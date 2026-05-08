import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import type { WorkspaceRole } from '@/types/database'

type Params = { params: Promise<{ id: string; followUpId: string }> }

const updateFollowUpSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(2000).nullable().optional(),
  due_at: z.string().datetime({ local: true }).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: leadId, followUpId } = await params
    const cookieStore = await cookies()
    const supabase = (await createServerClient(cookieStore)) as unknown as ReturnType<typeof createAdminClient>

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: WorkspaceRole } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const body = await req.json()
    const parsed = updateFollowUpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const patch = normalizeFollowUpPatch(parsed.data)
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
    }

    if (
      'assigned_to' in patch
      && patch.assigned_to
      && !['super_admin', 'admin'].includes(member.role)
      && patch.assigned_to !== user.id
    ) {
      return NextResponse.json({ error: 'Reps can only assign follow-ups to themselves' }, { status: 403 })
    }

    if (patch.assigned_to) {
      const { data: assignee } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', member.workspace_id)
        .eq('user_id', patch.assigned_to)
        .eq('is_active', true)
        .single() as { data: { user_id: string } | null; error: unknown }

      if (!assignee) return NextResponse.json({ error: 'Assignee is not a workspace member' }, { status: 422 })
    }

    const { data: existing } = await supabase
      .from('follow_ups')
      .select('id, title, completed_at')
      .eq('id', followUpId)
      .eq('lead_id', leadId)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: { id: string; title: string; completed_at: string | null } | null; error: unknown }

    if (!existing) return NextResponse.json({ error: 'Follow-up not found' }, { status: 404 })

    const { data: followUp, error } = await supabase
      .from('follow_ups')
      .update(patch)
      .eq('id', followUpId)
      .eq('lead_id', leadId)
      .eq('workspace_id', member.workspace_id)
      .select('id, title, notes, due_at, completed_at, assigned_to')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!followUp) return NextResponse.json({ error: 'Follow-up not found' }, { status: 404 })

    if (patch.completed_at && !existing.completed_at) {
      await createAdminClient().from('activity_logs').insert({
        workspace_id: member.workspace_id,
        lead_id: leadId,
        user_id: user.id,
        type: 'follow_up_completed',
        metadata: { title: existing.title },
      })
    }

    return NextResponse.json({ follow_up: followUp })
  } catch (err) {
    console.error('[PATCH /api/leads/[id]/follow-ups/[followUpId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id: leadId, followUpId } = await params
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

    const { error } = await supabase
      .from('follow_ups')
      .delete()
      .eq('id', followUpId)
      .eq('lead_id', leadId)
      .eq('workspace_id', member.workspace_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/leads/[id]/follow-ups/[followUpId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function normalizeFollowUpPatch(input: z.infer<typeof updateFollowUpSchema>) {
  const patch: Record<string, string | null> = {}

  if (input.title !== undefined) patch.title = input.title
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  if (input.due_at !== undefined) patch.due_at = new Date(input.due_at).toISOString()
  if (input.assigned_to !== undefined) patch.assigned_to = input.assigned_to
  if (input.completed_at !== undefined) {
    patch.completed_at = input.completed_at ? new Date(input.completed_at).toISOString() : null
  }

  return patch as Partial<{
    title: string
    notes: string | null
    due_at: string
    assigned_to: string | null
    completed_at: string | null
  }>
}

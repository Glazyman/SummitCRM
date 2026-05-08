import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import type { WorkspaceRole } from '@/types/database'

type Params = { params: Promise<{ id: string }> }

const createFollowUpSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(2000).optional().nullable(),
  due_at: z.string().datetime({ local: true }),
  assigned_to: z.string().uuid().nullable().optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: leadId } = await params
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
    const parsed = createFollowUpSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const assignedTo = parsed.data.assigned_to || user.id
    if (!['super_admin', 'admin'].includes(member.role) && assignedTo !== user.id) {
      return NextResponse.json({ error: 'Reps can only assign follow-ups to themselves' }, { status: 403 })
    }

    const { data: assignee } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', member.workspace_id)
      .eq('user_id', assignedTo)
      .eq('is_active', true)
      .single() as { data: { user_id: string } | null; error: unknown }

    if (!assignee) return NextResponse.json({ error: 'Assignee is not a workspace member' }, { status: 422 })

    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .single() as { data: { id: string } | null; error: unknown }

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const dueAt = new Date(parsed.data.due_at).toISOString()
    const { data: followUp, error } = await supabase
      .from('follow_ups')
      .insert({
        workspace_id: member.workspace_id,
        lead_id: leadId,
        assigned_to: assignedTo,
        title: parsed.data.title,
        notes: parsed.data.notes?.trim() || null,
        due_at: dueAt,
      })
      .select('id, title, notes, due_at, completed_at, assigned_to')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!followUp) return NextResponse.json({ error: 'Failed to create follow-up' }, { status: 500 })

    await createAdminClient().from('activity_logs').insert({
      workspace_id: member.workspace_id,
      lead_id: leadId,
      user_id: user.id,
      type: 'follow_up_scheduled',
      metadata: { title: followUp.title, due_at: followUp.due_at },
    })

    return NextResponse.json({ follow_up: followUp }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/leads/[id]/follow-ups]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

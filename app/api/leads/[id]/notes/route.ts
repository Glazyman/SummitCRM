import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { getActor } from '@/lib/auth/actor'

type Params = { params: Promise<{ id: string }> }

// Recipient list — accepts either a single uuid (legacy) or an array
// (multi-assign UI). Both shapes are normalised to an array.
const createNoteSchema = z.object({
  content:     z.string().trim().min(1).max(5000),
  assigned_to: z.union([
    z.string().uuid(),
    z.array(z.string().uuid()).max(50),
    z.null(),
  ]).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: leadId } = await params
    const cookieStore = await cookies()
    const supabase = (await createServerClient(cookieStore)) as unknown as ReturnType<typeof createAdminClient>

    // Effective actor: when an admin is "viewing as" a teammate, the note is
    // authored UNDER that teammate and the rep assignment rules apply to them.
    const actor = await getActor()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const member = { workspace_id: actor.workspaceId, role: actor.role }
    const user = { id: actor.userId }

    const body = await req.json()
    const parsed = createNoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, assigned_to')
      .eq('id', leadId)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .single() as {
        data: { id: string; first_name: string | null; last_name: string | null; email: string; assigned_to: string | null } | null
        error: unknown
      }

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // ── Normalise + validate the recipient list ──────────────────────────
    // Rules:
    //   - Each recipient must be an active member of the same workspace.
    //   - Reps can only assign notes to admins/super_admins (or themselves).
    //   - Admins can ping other admins AND the rep currently assigned to
    //     this lead. They can't ping a rep who isn't on this lead.
    //   - Self-assignment is allowed; the notification fan-out skips self.
    const rawAssigned = parsed.data.assigned_to
    const assignedIds: string[] = Array.isArray(rawAssigned)
      ? Array.from(new Set(rawAssigned))
      : rawAssigned
        ? [rawAssigned]
        : []

    let recipients: Array<{ user_id: string; role: string }> = []
    if (assignedIds.length > 0) {
      const { data } = await supabase
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', member.workspace_id)
        .eq('is_active', true)
        .in('user_id', assignedIds) as { data: Array<{ user_id: string; role: string }> | null }

      recipients = data ?? []
      if (recipients.length !== assignedIds.length) {
        return NextResponse.json({ error: 'One or more recipients are not workspace members' }, { status: 422 })
      }

      const isAuthorRep   = member.role === 'rep'
      const isAuthorAdmin = ['admin', 'super_admin'].includes(member.role)
      for (const r of recipients) {
        const isSelf           = r.user_id === user.id
        const isRecipientAdmin = ['admin', 'super_admin'].includes(r.role)
        const isRecipientRep   = r.role === 'rep'
        if (isSelf) continue
        if (isAuthorRep && !isRecipientAdmin) {
          return NextResponse.json(
            { error: 'Reps can only assign notes to admins' },
            { status: 403 },
          )
        }
        if (isAuthorAdmin && isRecipientRep && lead.assigned_to !== r.user_id) {
          return NextResponse.json(
            { error: 'Admins can only assign notes to the rep who owns this lead' },
            { status: 403 },
          )
        }
      }
    }
    // Primary recipient stored on the note row for back-compat with the
    // single-column assigned_to. Additional recipients exist only as
    // notification fan-out (no schema change required).
    const primaryAssignee: string | null = assignedIds[0] ?? null

    // ── Insert the note (admin client bypasses RLS) ──────────────────────
    const admin = createAdminClient()
    const { data: note, error } = await (admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('notes')
      .insert({
        workspace_id: member.workspace_id,
        lead_id:      leadId,
        author_id:    user.id,
        content:      parsed.data.content,
        assigned_to:  primaryAssignee,
      })
      .select('id, lead_id, author_id, content, assigned_to, created_at, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!note) return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })

    // ── Fan out one "mention" notification per non-self recipient ────────
    const fanoutIds = assignedIds.filter((id) => id !== user.id)
    if (fanoutIds.length > 0) {
      const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || lead.email
      const preview  = parsed.data.content.length > 140
        ? parsed.data.content.slice(0, 137) + '…'
        : parsed.data.content
      const rows = fanoutIds.map((uid) => ({
        workspace_id: member.workspace_id,
        user_id:      uid,
        type:         'mention',
        title:        `Note on ${leadName}`,
        body:         preview,
        link:         `/leads/${leadId}`,
        lead_id:      leadId,
      }))
      await (admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from('notifications')
        .insert(rows)
    }

    return NextResponse.json({ note, recipient_count: assignedIds.length }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/leads/[id]/notes]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

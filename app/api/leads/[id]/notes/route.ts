import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

const createNoteSchema = z.object({
  content:     z.string().trim().min(1).max(5000),
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
      .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

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

    // ── Validate the recipient if one is set ─────────────────────────────
    // Rules:
    //   - Recipient must be an active member of the same workspace.
    //   - Reps can only assign notes to admins/super_admins (or themselves).
    //   - Admins can ping other admins, AND the rep currently assigned to
    //     this lead. They cannot ping a rep who isn't on this lead.
    //   - Self-assignment is allowed; notification insert is skipped for self.
    const assignedTo = parsed.data.assigned_to ?? null
    let recipientRole: string | null = null

    if (assignedTo) {
      const { data: recipient } = await supabase
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', member.workspace_id)
        .eq('user_id', assignedTo)
        .eq('is_active', true)
        .single() as { data: { user_id: string; role: string } | null }

      if (!recipient) {
        return NextResponse.json({ error: 'Recipient is not a workspace member' }, { status: 422 })
      }
      recipientRole = recipient.role
      const isSelf            = assignedTo === user.id
      const isAuthorRep       = member.role === 'rep'
      const isAuthorAdmin     = ['admin', 'super_admin'].includes(member.role)
      const isRecipientAdmin  = ['admin', 'super_admin'].includes(recipient.role)
      const isRecipientRep    = recipient.role === 'rep'

      if (!isSelf) {
        if (isAuthorRep && !isRecipientAdmin) {
          return NextResponse.json(
            { error: 'Reps can only assign notes to admins' },
            { status: 403 },
          )
        }
        if (isAuthorAdmin && isRecipientRep && lead.assigned_to !== assignedTo) {
          return NextResponse.json(
            { error: 'Admins can only assign notes to the rep who owns this lead' },
            { status: 403 },
          )
        }
      }
    }

    // ── Insert the note (admin client bypasses RLS) ──────────────────────
    const admin = createAdminClient()
    const { data: note, error } = await (admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from('notes')
      .insert({
        workspace_id: member.workspace_id,
        lead_id:      leadId,
        author_id:    user.id,
        content:      parsed.data.content,
        assigned_to:  assignedTo,
      })
      .select('id, lead_id, author_id, content, assigned_to, created_at, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!note) return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })

    // ── Create a "mention" notification for the recipient ────────────────
    // Skip self-assignment (don't ping yourself).
    if (assignedTo && assignedTo !== user.id) {
      const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim() || lead.email
      const preview  = parsed.data.content.length > 140
        ? parsed.data.content.slice(0, 137) + '…'
        : parsed.data.content
      await (admin as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from('notifications')
        .insert({
          workspace_id: member.workspace_id,
          user_id:      assignedTo,
          type:         'mention',
          title:        `Note on ${leadName}`,
          body:         preview,
          link:         `/leads/${leadId}`,
          lead_id:      leadId,
        })
    }

    // Reflect the recipient's role back so the client can update local state
    return NextResponse.json({ note, recipient_role: recipientRole }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/leads/[id]/notes]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

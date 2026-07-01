import { NextRequest, NextResponse } from 'next/server'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server'
import { getActor } from '@/lib/auth/actor'

// POST /api/leads — create a new lead
export async function POST(req: NextRequest) {
  const supabase = await createClient() as any
  // Effective actor: a lead created while an admin is "viewing as" a rep is
  // assigned to (and attributed to) the rep by default.
  const actor = await getActor()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const member = { workspace_id: actor.workspaceId, role: actor.role }
  const user = { id: actor.userId }

  const body = await req.json().catch(() => ({}))
  const {
    first_name, last_name, email, phone, title,
    company, website, linkedin_url, batch_id,
    assigned_to, status = 'new',
  } = body

  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })
  const requestedAssignee = assigned_to || null
  const effectiveAssignee = requestedAssignee ?? user.id

  if (member.role === 'rep' && requestedAssignee && requestedAssignee !== user.id) {
    return NextResponse.json({ error: 'Reps can only assign leads to themselves' }, { status: 403 })
  }

  if (requestedAssignee) {
    const { data: assignee } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', member.workspace_id)
      .eq('user_id', requestedAssignee)
      .eq('is_active', true)
      .single()
    if (!assignee) return NextResponse.json({ error: 'Assignee is not a workspace member' }, { status: 422 })
  }

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      workspace_id: member.workspace_id,
      first_name:   first_name || null,
      last_name:    last_name  || null,
      email:        email.toLowerCase().trim(),
      phone:        phone      || null,
      title:        title      || null,
      company:      company    || null,
      website:      website    || null,
      linkedin_url: linkedin_url || null,
      batch_id:     batch_id   || null,
      assigned_to:  effectiveAssignee,
      status,
      source:       'manual',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A lead with this email already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log activity
  await supabase.from('activity_logs').insert({
    workspace_id: member.workspace_id,
    lead_id:      lead.id,
    user_id:      user.id,
    type:         'lead_created',
    metadata:     { source: 'manual' },
  })

  return NextResponse.json({ lead }, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getContext() {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient() as any
  const { data: member } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!member) return null
  return { user, member, admin }
}

// PATCH /api/leads/[id]/calls/[callId] — edit outcome and/or notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; callId: string }> }
) {
  const { id: leadId, callId } = await params
  const ctx = await getContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, member, admin } = ctx

  const body = await req.json().catch(() => ({}))
  const { outcome, notes } = body

  // Verify lead belongs to workspace
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('id, workspace_id, assigned_to')
    .eq('id', leadId)
    .eq('workspace_id', member.workspace_id)
    .single()
  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  if (member.role === 'rep' && lead.assigned_to !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Verify call exists and belongs to this lead
  const { data: callLog } = await admin
    .from('call_logs')
    .select('id, logged_by')
    .eq('id', callId)
    .eq('lead_id', leadId)
    .single()

  if (!callLog) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Reps can only edit their own calls
  if (member.role === 'rep' && callLog.logged_by !== user.id) {
    return NextResponse.json({ error: 'You can only edit your own calls' }, { status: 403 })
  }

  const patch: Record<string, unknown> = {}
  if (outcome !== undefined) patch.outcome = outcome
  if (notes !== undefined) patch.notes = notes ?? null

  const { data: updated, error } = await admin
    .from('call_logs')
    .update(patch)
    .eq('id', callId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ call: updated })
}

// DELETE /api/leads/[id]/calls/[callId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; callId: string }> }
) {
  const { id: leadId, callId } = await params
  const ctx = await getContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, member, admin } = ctx

  // Verify lead belongs to workspace
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('id, workspace_id, assigned_to')
    .eq('id', leadId)
    .eq('workspace_id', member.workspace_id)
    .single()
  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  if (member.role === 'rep' && lead.assigned_to !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Verify call exists
  const { data: callLog } = await admin
    .from('call_logs')
    .select('id, logged_by')
    .eq('id', callId)
    .eq('lead_id', leadId)
    .single()

  if (!callLog) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Reps can only delete their own calls
  if (member.role === 'rep' && callLog.logged_by !== user.id) {
    return NextResponse.json({ error: 'You can only delete your own calls' }, { status: 403 })
  }

  const { error } = await admin.from('call_logs').delete().eq('id', callId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

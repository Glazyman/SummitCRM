import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { LeadStatus } from '@/types/database'

// PATCH /api/leads/bulk — bulk update (status, assigned_to, batch_id)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { ids, status, assigned_to, batch_id } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 leads per bulk operation' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status !== undefined)      patch.status      = status as LeadStatus
  if (assigned_to !== undefined) patch.assigned_to = assigned_to || null
  if (batch_id !== undefined)    patch.batch_id    = batch_id || null

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('leads')
    .update(patch)
    .in('id', ids)
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity for status changes
  if (status) {
    const activityRows = ids.map((id: string) => ({
      workspace_id: member.workspace_id,
      lead_id:      id,
      user_id:      user.id,
      type:         'lead_status_changed',
      metadata:     { to: status, bulk: true },
    }))
    await supabase.from('activity_logs').insert(activityRows)
  }

  return NextResponse.json({ updated: ids.length })
}

// DELETE /api/leads/bulk — bulk soft-delete
export async function DELETE(req: NextRequest) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

  // Only managers/admins can bulk delete
  if (!['admin', 'super_admin'].includes(member.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { ids } = body
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: 'Maximum 200 leads per bulk delete' }, { status: 400 })
  }

  const { error } = await supabase
    .from('leads')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('workspace_id', member.workspace_id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: ids.length })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { WorkspaceRole } from '@/types/database'
/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/team/members — list all workspace members with their profile info
export async function GET() {
  const supabase = await createClient() as any
  const admin = createAdminClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentMember } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!currentMember) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

  // Fetch all members
  const { data: members, error } = await admin
    .from('workspace_members')
    .select('id, user_id, role, is_active, joined_at, created_at')
    .eq('workspace_id', currentMember.workspace_id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with auth user info (email/name) using admin client
  const userIds: string[] = (members ?? []).map((m: any) => m.user_id as string)
  const enriched = await Promise.all(
    userIds.map(async (uid: string) => {
      try {
        const { data } = await admin.auth.admin.getUserById(uid)
        return {
          id:        uid,
          email:     data.user?.email ?? null,
          full_name: data.user?.user_metadata?.full_name ?? data.user?.user_metadata?.name ?? null,
        }
      } catch {
        return { id: uid, email: null, full_name: null }
      }
    })
  )

  const userMap = new Map(enriched.map((u) => [u.id, u]))

  const result = (members ?? []).map((m: any) => {
    const u = userMap.get(m.user_id)
    return {
      id:        m.id,
      user_id:   m.user_id,
      role:      m.role,
      is_active: m.is_active,
      joined_at: m.joined_at,
      email:     u?.email ?? null,
      full_name: u?.full_name ?? null,
      is_me:     m.user_id === user.id,
    }
  })

  return NextResponse.json({ members: result })
}

// DELETE /api/team/members — permanently remove a member from the workspace
export async function DELETE(req: NextRequest) {
  const supabase = await createClient() as any
  const admin = createAdminClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentMember } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!currentMember) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
  if (!['admin', 'super_admin'].includes(currentMember.role)) {
    return NextResponse.json({ error: 'Only admins can remove members' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { member_id }: { member_id: string } = body
  if (!member_id) return NextResponse.json({ error: 'member_id is required' }, { status: 400 })

  // Fetch the member's user_id before deleting so we can remove them from Supabase Auth
  const { data: targetMember } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('id', member_id)
    .eq('workspace_id', currentMember.workspace_id)
    .single()

  if (!targetMember) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const { error } = await admin
    .from('workspace_members')
    .delete()
    .eq('id', member_id)
    .eq('workspace_id', currentMember.workspace_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Delete from Supabase Auth so the account is fully removed.
  // This means re-inviting them will send a fresh invite email (new user flow).
  await admin.auth.admin.deleteUser(targetMember.user_id).catch(() => null)

  return NextResponse.json({ success: true })
}

// PATCH /api/team/members — update a member's role or active status
export async function PATCH(req: NextRequest) {
  const supabase = await createClient() as any
  const admin = createAdminClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: currentMember } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!currentMember) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
  if (!['admin', 'super_admin'].includes(currentMember.role)) {
    return NextResponse.json({ error: 'Only admins can manage members' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { member_id, role, is_active }: { member_id: string; role?: WorkspaceRole; is_active?: boolean } = body

  if (!member_id) return NextResponse.json({ error: 'member_id is required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (role !== undefined)      patch.role      = role
  if (is_active !== undefined) patch.is_active = is_active

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: updated, error } = await admin
    .from('workspace_members')
    .update(patch)
    .eq('id', member_id)
    .eq('workspace_id', currentMember.workspace_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity
  const actType = is_active === false ? 'member_deactivated' : role ? 'role_changed' : 'member_deactivated'
  await admin.from('activity_logs').insert({
    workspace_id: currentMember.workspace_id,
    lead_id:      null,
    user_id:      user.id,
    type:         actType,
    metadata:     { member_id, ...patch },
  })

  return NextResponse.json({ member: updated })
}

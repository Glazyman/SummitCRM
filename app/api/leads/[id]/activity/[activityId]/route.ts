/**
 * DELETE /api/leads/[id]/activity/[activityId]
 * Hard-deletes a single activity_log entry for the workspace.
 * Only the entry's owner OR an admin/manager can delete it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string; activityId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { activityId } = await params
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
    if (member.role === 'viewer') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Fetch the entry to validate ownership
    const { data: entry } = await (admin as any)
      .from('activity_logs')
      .select('id, user_id')
      .eq('id', activityId)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: { id: string; user_id: string } | null }

    if (!entry) return NextResponse.json({ error: 'Activity entry not found' }, { status: 404 })

    const isAdmin = ['admin', 'super_admin', 'manager'].includes(member.role)
    if (entry.user_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { error } = await (admin as any)
      .from('activity_logs')
      .delete()
      .eq('id', activityId)
      .eq('workspace_id', member.workspace_id)

    if (error) return NextResponse.json({ error: (error as any).message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/leads/[id]/activity/[activityId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/pipeline/stage-overflow?stage_id=...&offset=N
 *
 * Loads the next 100 leads in one stage when the user clicks "+N more"
 * on the pipeline page. Server enforces rep filtering.
 */
import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: member } = await admin
      .from('workspace_members').select('workspace_id, role')
      .eq('user_id', user.id).eq('is_active', true).single() as
      { data: { workspace_id: string; role: string } | null }
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const isAdmin = ['admin', 'super_admin'].includes(member.role)
    const { searchParams } = new URL(req.url)
    const stageId = searchParams.get('stage_id') ?? ''
    const offset  = Math.max(0, Number(searchParams.get('offset') ?? 0))

    if (!stageId) return NextResponse.json({ error: 'stage_id required' }, { status: 400 })

    const { data, error } = await admin.rpc('get_pipeline_stage_overflow', {
      p_workspace_id: member.workspace_id,
      p_stage_id:     stageId,
      p_assigned_to:  isAdmin ? null : user.id,
      p_limit:        100,
      p_offset:       offset,
    })

    if (error) {
      console.error('[get_pipeline_stage_overflow]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ leads: data ?? [] })
  } catch (err) {
    console.error('[GET /api/pipeline/stage-overflow]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

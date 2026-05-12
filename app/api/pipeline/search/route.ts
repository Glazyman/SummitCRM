/**
 * GET /api/pipeline/search?q=...
 *
 * Server-side search across the pipeline only — leads with do_not_contact /
 * unsubscribed are excluded. Returns the same shape as the initial page
 * load (leads + counts + totals) so the client can swap in the result
 * without restructuring state.
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
    const q = (searchParams.get('q') ?? '').trim()

    const { data, error } = await admin.rpc('get_pipeline_leads_json', {
      p_workspace_id:    member.workspace_id,
      p_assigned_to:     isAdmin ? null : user.id,
      p_per_stage_limit: 100,
      p_search:          q.length > 0 ? q : null,
    })

    if (error) {
      console.error('[get_pipeline_leads_json search]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? { leads: [], counts: {}, totals: {} })
  } catch (err) {
    console.error('[GET /api/pipeline/search]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

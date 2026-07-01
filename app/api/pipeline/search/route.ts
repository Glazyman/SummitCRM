/**
 * GET /api/pipeline/search?q=...
 *
 * Server-side search across the pipeline only — leads with do_not_contact /
 * unsubscribed are excluded. Returns the same shape as the initial page
 * load (leads + counts + totals) so the client can swap in the result
 * without restructuring state.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getActor } from '@/lib/auth/actor'

export async function GET(req: Request) {
  try {
    // Effective actor — an admin viewing-as a rep searches the rep's pipeline.
    const actor = await getActor()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const member = { workspace_id: actor.workspaceId, role: actor.role }
    const user = { id: actor.userId }

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

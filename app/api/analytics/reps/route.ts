/**
 * GET /api/analytics/reps
 * Per-rep call, follow-up, and lead performance. admin+ access.
 *
 * Aggregation runs inside Postgres via get_reps_analytics() — single
 * jsonb response bypasses PostgREST's 1000-row cap. Names + emails are
 * stitched in here via the users-lookup RPC.
 */
import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { getUsersByIdsFull } from '@/lib/users'

type RepRow = {
  user_id:              string
  role:                 string
  calls:                number
  calls_answered:       number
  calls_voicemail:      number
  calls_no_answer:      number
  calls_wrong_number:   number
  follow_ups_pending:   number
  follow_ups_overdue:   number
  follow_ups_completed: number
  leads_assigned:       number
  leads_active:         number
  leads_new:            number
}

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
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const now   = new Date()
    const start = searchParams.get('start') ?? new Date(new Date(now).setDate(now.getDate() - 30)).toISOString()
    const end   = searchParams.get('end')   ?? now.toISOString()
    const wsId  = member.workspace_id

    const { data, error } = await admin.rpc('get_reps_analytics', {
      p_workspace_id: wsId,
      p_start:        start,
      p_end:          end,
    })

    if (error) {
      console.error('[get_reps_analytics]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const payload = (data ?? {}) as {
      reps?:     RepRow[]
      overview?: Record<string, number>
      period?:   { start: string; end: string }
    }
    const repsRaw = payload.reps ?? []

    // Attach name + email via users-cache.
    const memberIds = repsRaw.map((r) => r.user_id)
    const memberUsers = await getUsersByIdsFull(admin, wsId, memberIds)
    const nameById = new Map(
      memberUsers.map(u => [u.id, { name: (u.user_metadata?.full_name as string | undefined) ?? null, email: u.email ?? '' }])
    )

    const reps = repsRaw.map((r) => ({
      ...r,
      user_email: nameById.get(r.user_id)?.email ?? '',
      full_name:  nameById.get(r.user_id)?.name  ?? null,
    }))

    // Unique leads called in the range — one per lead (a lead called multiple
    // times counts once), via the denormalized `last_contacted_at`. Exact for
    // the analytics presets (all end at "now": today/7d/30d/all). NOTE: a custom
    // range ending in the past could miss leads also called after `end`.
    const { count: uniqueLeads } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId)
      .gte('last_contacted_at', start)
      .lte('last_contacted_at', end)
      .is('deleted_at', null) as { count: number | null }

    return NextResponse.json({
      reps,
      overview: { ...(payload.overview ?? {}), unique_leads: uniqueLeads ?? 0 },
      period:   payload.period   ?? { start, end },
    })
  } catch (err) {
    console.error('[GET /api/analytics/reps]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

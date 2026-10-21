/**
 * GET /api/analytics/reps
 * Per-rep call, follow-up, and lead performance. admin+ access.
 *
 * Aggregation runs inside Postgres via get_reps_analytics() — single
 * jsonb response bypasses PostgREST's 1000-row cap. Names + emails are
 * stitched in here via the users-lookup RPC.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { getUsersByIdsFull } from '@/lib/users'
import { selectAll } from '@/lib/supabase/select-all'

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

    // Per-rep unique leads called in the range (distinct lead_id per rep) — so
    // each rep card can show "leads called" (one per lead) vs raw "calls".
    const { data: uniqByRep } = await admin.rpc('get_unique_leads_called_by_rep_range', {
      p_workspace_id: wsId, p_start: start, p_end: end,
    }) as { data: Array<{ user_id: string; leads_called: number }> | null }
    const uniqByRepMap = new Map((uniqByRep ?? []).map(u => [u.user_id, Number(u.leads_called)]))

    // Leads each rep MARKED interested in the range (from the interest-change
    // log) — "what did this rep do that day", unlike the current-snapshot
    // interested count below.
    // Best-effort: a missing enum value or log hiccup must not take the whole
    // panel down — the counts just read 0.
    const marks = await selectAll<{ user_id: string | null }>((from, to) =>
      (admin as any).from('activity_logs').select('user_id')
        .eq('workspace_id', wsId).eq('type', 'interest_status_changed').eq('metadata->>to', 'interested')
        .gte('created_at', start).lt('created_at', end).range(from, to)).catch((err) => { console.error('[interested marks]', err); return [] })
    const marksByRep = new Map<string, number>()
    for (const m of marks) if (m.user_id) marksByRep.set(m.user_id, (marksByRep.get(m.user_id) ?? 0) + 1)

    const reps = repsRaw.map((r) => ({
      ...r,
      user_email:   nameById.get(r.user_id)?.email ?? '',
      full_name:    nameById.get(r.user_id)?.name  ?? null,
      unique_leads: uniqByRepMap.get(r.user_id) ?? 0,
      interested_marked: marksByRep.get(r.user_id) ?? 0,
    }))

    // last_contacted_at only answers "called since X" — for a window that ends
    // in the past (Pick day) count distinct leads straight from call_logs.
    const endsNow = Date.now() - Date.parse(end) < 5 * 60_000
    const pastUnique = endsNow ? null : new Set(
      (await selectAll<{ lead_id: string }>((from, to) =>
        (admin as any).from('call_logs').select('lead_id')
          .eq('workspace_id', wsId).gte('called_at', start).lt('called_at', end).range(from, to)))
        .map((c) => c.lead_id),
    ).size

    // unique leads = distinct leads called in the range (one per lead) via the
    // denormalized last_contacted_at — exact for the presets (all end "now").
    // The lead-status counts are a CURRENT workspace snapshot (lead states are
    // not call events, so they aren't date-filtered).
    const [uniqRes, interestedRes, notInterestedRes, badLeadsRes, contactedRes] = await Promise.all([
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).gte('last_contacted_at', start).lte('last_contacted_at', end).is('deleted_at', null),
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).eq('interest_status', 'interested').is('deleted_at', null),
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).eq('interest_status', 'not_interested').is('deleted_at', null),
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).eq('status', 'do_not_contact').is('deleted_at', null),
      // Contacted leads (ever) — the meaningful denominator for the lead-status
      // breakdown. "% of total leads" was ~0 because most leads are untouched
      // "new"; lead-status % should be of the leads actually worked.
      admin.from('leads').select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).not('last_contacted_at', 'is', null).is('deleted_at', null),
    ]) as Array<{ count: number | null }>

    return NextResponse.json({
      reps,
      overview: {
        ...(payload.overview ?? {}),
        unique_leads:    pastUnique ?? uniqRes.count ?? 0,
        interested_marked: marks.length,
        interested:      interestedRes.count    ?? 0,
        not_interested:  notInterestedRes.count ?? 0,
        bad_leads:       badLeadsRes.count       ?? 0,
        contacted_total: contactedRes.count      ?? 0,
      },
      period: payload.period ?? { start, end },
    })
  } catch (err) {
    console.error('[GET /api/analytics/reps]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

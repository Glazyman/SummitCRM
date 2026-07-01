import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor } from '@/lib/auth/actor'

export async function GET() {
  try {
    // Effective actor — an admin viewing-as a rep sees the rep's due tasks.
    const actor = await getActor()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const member = { workspace_id: actor.workspaceId }
    const user = { id: actor.userId }

    const admin = createAdminClient()

    const now         = new Date()
    const startToday  = new Date(now); startToday.setHours(0, 0, 0, 0)
    const endToday    = new Date(now); endToday.setHours(23, 59, 59, 999)
    // "Upcoming" = next 7 days after today. Tunable.
    const endUpcoming = new Date(startToday); endUpcoming.setDate(endUpcoming.getDate() + 8)

    // All incomplete follow-ups assigned to this user that are due
    // anytime up to ~7 days out (overdue + today + upcoming-week).
    const { data, error } = await (admin as any)
      .from('follow_ups')
      .select(`
        id, title, notes, due_at, completed_at, assigned_to,
        lead:leads(id, first_name, last_name, email, company, phone)
      `)
      .eq('workspace_id', member.workspace_id)
      .eq('assigned_to', user.id)
      .is('completed_at', null)
      .lte('due_at', endUpcoming.toISOString())
      .order('due_at', { ascending: true })
      .limit(50) as { data: unknown[] | null; error: unknown }

    if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 })

    const items = (data ?? []) as Array<{
      id: string
      title: string
      notes: string | null
      due_at: string
      lead: { id: string; first_name: string | null; last_name: string | null; email: string; company: string | null; phone: string | null } | null
    }>

    const overdue  = items.filter((f) => new Date(f.due_at) < startToday)
    const dueToday = items.filter((f) => {
      const d = new Date(f.due_at)
      return d >= startToday && d <= endToday
    })
    const upcoming = items.filter((f) => new Date(f.due_at) > endToday)

    return NextResponse.json({
      overdue,
      dueToday,
      upcoming,
      // Badge-relevant: overdue + today. Upcoming is FYI only.
      count: overdue.length + dueToday.length,
    })
  } catch (err) {
    console.error('[GET /api/tasks/due]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

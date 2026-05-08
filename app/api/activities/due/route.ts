import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: member } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const now      = new Date()
    const endToday = new Date(now)
    endToday.setHours(23, 59, 59, 999)

    // All incomplete follow-ups assigned to this user that are due today or overdue
    const { data, error } = await (admin as any)
      .from('follow_ups')
      .select(`
        id, title, notes, due_at, completed_at, assigned_to,
        lead:leads(id, first_name, last_name, email, company, phone)
      `)
      .eq('workspace_id', member.workspace_id)
      .eq('assigned_to', user.id)
      .is('completed_at', null)
      .lte('due_at', endToday.toISOString())
      .order('due_at', { ascending: true }) as { data: unknown[] | null; error: unknown }

    if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 })

    const items = (data ?? []) as Array<{
      id: string
      title: string
      notes: string | null
      due_at: string
      lead: { id: string; first_name: string | null; last_name: string | null; email: string; company: string | null; phone: string | null } | null
    }>

    const startToday = new Date(now)
    startToday.setHours(0, 0, 0, 0)

    const overdue  = items.filter((f) => new Date(f.due_at) < startToday)
    const dueToday = items.filter((f) => new Date(f.due_at) >= startToday)

    return NextResponse.json({
      overdue,
      dueToday,
      count: items.length,
    })
  } catch (err) {
    console.error('[GET /api/activities/due]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

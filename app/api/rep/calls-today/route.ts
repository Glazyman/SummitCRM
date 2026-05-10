import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: member } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const start = new Date()
    start.setHours(0, 0, 0, 0)

    const { data, error } = await (admin as any)
      .from('call_logs')
      .select('id, outcome, duration_sec, notes, called_at, lead:leads!inner(id, first_name, last_name, email, company)')
      .eq('workspace_id', member.workspace_id)
      .eq('logged_by', user.id)
      .gte('called_at', start.toISOString())
      .order('called_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const calls = ((data ?? []) as Array<{
      id: string
      outcome: string
      duration_sec: number | null
      notes: string | null
      called_at: string
      lead:
        | Array<{ id: string; first_name: string | null; last_name: string | null; email: string; company: string | null }>
        | { id: string; first_name: string | null; last_name: string | null; email: string; company: string | null }
        | null
    }>).map((row) => {
      const lead = Array.isArray(row.lead) ? (row.lead[0] ?? null) : row.lead
      const name = lead ? ([lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email) : 'Lead'
      return {
        id: row.id,
        outcome: row.outcome,
        duration_sec: row.duration_sec,
        notes: row.notes,
        called_at: row.called_at,
        lead: lead ? { id: lead.id, name, company: lead.company, email: lead.email } : null,
      }
    })

    return NextResponse.json({ calls })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load calls' }, { status: 500 })
  }
}

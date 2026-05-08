import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/leads/[id]/calls — list call logs for a lead
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('lead_id', leadId)
    .order('called_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ calls: data })
}

// POST /api/leads/[id]/calls — log a new call
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { outcome, duration_sec, notes } = body

  if (!outcome) return NextResponse.json({ error: 'outcome is required' }, { status: 400 })

  // Get workspace_id from lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('workspace_id')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const { data: call, error } = await supabase
    .from('call_logs')
    .insert({
      lead_id:      leadId,
      workspace_id: lead.workspace_id,
      logged_by:    user.id,
      outcome,
      duration_sec: duration_sec ?? null,
      notes:        notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity
  await supabase.from('activity_logs').insert({
    workspace_id: lead.workspace_id,
    lead_id:      leadId,
    user_id:      user.id,
    type:         'call_logged',
    metadata: {
      outcome,
      duration_sec: duration_sec ?? null,
    },
  })

  return NextResponse.json({ call }, { status: 201 })
}

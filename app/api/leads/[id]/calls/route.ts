import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_FOLLOWUP_HOUR = 11 // 11 AM — change this to adjust follow-up time

// Logging a call should bring the lead's status in line with the outcome
// (inverse of STATUS_TO_CALL_OUTCOME in /api/leads/[id]/route.ts). 'answered'
// and 'callback_requested' both map to 'called' — a conversation happened.
const OUTCOME_TO_STATUS: Record<string, string> = {
  answered:           'called',
  voicemail:          'voicemail',
  no_answer:          'no_answer',
  wrong_number:       'wrong_number',
  callback_requested: 'called',
}

function tomorrowAt(hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

// GET /api/leads/[id]/calls — list call logs for a lead
// Reps only see calls for leads assigned to them; admins see all
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient() as any
  const { data: member } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

  // Verify the lead belongs to this workspace
  const leadQuery = admin
    .from('leads')
    .select('id, assigned_to, workspace_id')
    .eq('id', leadId)
    .eq('workspace_id', member.workspace_id)
    .single()

  const { data: lead, error: leadErr } = await leadQuery
  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Reps can only see calls for leads assigned to them
  if (member.role === 'rep' && lead.assigned_to !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('call_logs')
    .select('id, outcome, duration_sec, notes, called_at, logged_by')
    .eq('lead_id', leadId)
    .order('called_at', { ascending: false })
    .limit(200)

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

  const admin = createAdminClient() as any
  const { data: member } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

  // Verify lead belongs to workspace; reps can only log calls for their own leads
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .select('id, workspace_id, assigned_to, status')
    .eq('id', leadId)
    .eq('workspace_id', member.workspace_id)
    .single()

  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  if (member.role === 'rep' && lead.assigned_to !== user.id) {
    return NextResponse.json({ error: 'You can only log calls for your own leads' }, { status: 403 })
  }

  const { data: call, error } = await admin
    .from('call_logs')
    .insert({
      lead_id:      leadId,
      workspace_id: lead.workspace_id,
      logged_by:    user.id,
      outcome,
      duration_sec: duration_sec ?? null,
      notes:        notes ?? null,
      called_at:    new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity. Include call_log_id so the activity-delete route can
  // cascade-delete the underlying call when the user removes this entry.
  await admin.from('activity_logs').insert({
    workspace_id: lead.workspace_id,
    lead_id:      leadId,
    user_id:      user.id,
    type:         'call_logged',
    metadata: {
      outcome,
      duration_sec: duration_sec ?? null,
      call_log_id:  call.id,
    },
  })

  // Mirror the outcome onto lead.status so the lead reflects the call.
  // (The PATCH-status path auto-creates a call_logs row in the inverse
  // direction; this path is the equivalent for the Log Call UI.)
  const targetStatus = OUTCOME_TO_STATUS[outcome]
  if (targetStatus && targetStatus !== lead.status) {
    await admin
      .from('leads')
      .update({ status: targetStatus })
      .eq('id', leadId)
      .eq('workspace_id', lead.workspace_id)

    await admin.from('activity_logs').insert({
      workspace_id: lead.workspace_id,
      lead_id:      leadId,
      user_id:      user.id,
      type:         'lead_status_changed',
      metadata:     { from: lead.status, to: targetStatus, auto_from_call: true },
    })
  }

  // Callback promises have no lead status of their own (callbacks live in the
  // tasks system), so a callback outcome MUST suggest a task or the promise
  // silently disappears from every queue.
  const followUpSuggestion = (outcome === 'voicemail' || outcome === 'no_answer')
    ? {
        title:  outcome === 'voicemail' ? 'Follow up after voicemail' : 'Follow up after no answer',
        notes:  outcome === 'voicemail'
          ? 'Left voicemail. Try again tomorrow morning.'
          : 'No answer. Retry tomorrow morning.',
        due_at: tomorrowAt(DEFAULT_FOLLOWUP_HOUR),
      }
    : outcome === 'callback_requested'
    ? {
        title:  'Call back (requested by lead)',
        notes:  'Lead asked to be called back.',
        due_at: tomorrowAt(DEFAULT_FOLLOWUP_HOUR),
      }
    : null

  return NextResponse.json({ call, follow_up_suggestion: followUpSuggestion }, { status: 201 })
}

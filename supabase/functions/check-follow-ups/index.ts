import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // Verify authorization
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const today = new Date().toISOString().slice(0, 10)

  // Fetch follow-ups due today that are not completed
  const { data: followUps, error } = await supabase
    .from('follow_ups')
    .select('id, lead_id, notes, due_at, leads!inner(workspace_id, assigned_to, first_name, last_name)')
    .gte('due_at', `${today}T00:00:00Z`)
    .lt('due_at',  `${today}T23:59:59Z`)
    .is('completed_at', null)

  if (error) {
    console.error('Error fetching follow-ups:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let notified = 0
  let skipped  = 0

  for (const followUp of followUps ?? []) {
    const lead = Array.isArray(followUp.leads) ? followUp.leads[0] : followUp.leads
    if (!lead?.assigned_to) { skipped++; continue }

    // Check if already notified today for this follow-up
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', lead.assigned_to)
      .eq('type', 'follow_up_due')
      .like('title', `%${lead.first_name ?? ''} ${lead.last_name ?? ''}%`)
      .gte('created_at', `${today}T00:00:00Z`)
      .limit(1)
      .maybeSingle()

    if (existing) { skipped++; continue }

    // Check in-app preference
    const { data: pref } = await supabase
      .from('notification_preferences')
      .select('in_app')
      .eq('user_id', lead.assigned_to)
      .eq('workspace_id', lead.workspace_id)
      .eq('type', 'follow_up_due')
      .maybeSingle()

    if (pref && pref.in_app === false) { skipped++; continue }

    const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown lead'

    await supabase.from('notifications').insert({
      workspace_id: lead.workspace_id,
      user_id:      lead.assigned_to,
      type:         'follow_up_due',
      title:        `Follow-up due: ${leadName}`,
      body:         followUp.notes ?? 'Your scheduled follow-up is due today.',
      link:         `/leads/${followUp.lead_id}`,
      lead_id:      followUp.lead_id,
    })

    notified++
  }

  console.log(`check-follow-ups: ${notified} notified, ${skipped} skipped`)
  return new Response(JSON.stringify({ notified, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

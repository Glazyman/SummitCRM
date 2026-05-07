/**
 * supabase/functions/process-campaign/index.ts
 *
 * Deno Edge Function — called when a campaign is started.
 *
 * Algorithm:
 *   1. Load campaign steps + sending account
 *   2. Fetch all eligible leads in the batch (not unsubscribed, not DNC, has email)
 *   3. For each lead × step:
 *      a. Calculate scheduled_for = campaign_start + step.delay_days + random jitter
 *      b. Apply merge variables to subject + body (skip if use_ai=true, AI fills it later)
 *      c. INSERT into emails table (status='queued')
 *      d. INSERT into email_queue table
 *   4. Update campaign: total_leads, status='running' (or 'scheduled')
 *
 * Anti-spam safeguards built-in:
 *  - Jitter: each email's scheduled_for is offset by 0–45 min within send window
 *  - Send window: 08:00–18:00 UTC only
 *  - Daily limit: enforced by process-email-queue
 *  - Account rotation: optional multi-account distribution
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const JITTER_MAX_MINUTES   = 45
const SEND_WINDOW_START    = 8    // UTC hours
const SEND_WINDOW_END      = 18   // UTC hours
const BATCH_INSERT_SIZE    = 100  // rows per INSERT
const MAX_LEADS_PER_CAMPAIGN = 10_000

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// ── Entry point ───────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { campaign_id, workspace_id, start_at } = await req.json()
    if (!campaign_id || !workspace_id) {
      return new Response(JSON.stringify({ error: 'Missing campaign_id or workspace_id' }), { status: 400 })
    }

    const result = await processCampaign(campaign_id, workspace_id, start_at ?? new Date().toISOString())

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[process-campaign]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

// ── Main processing function ──────────────────────────────────────────────
async function processCampaign(
  campaignId:  string,
  workspaceId: string,
  startAt:     string,
): Promise<{ total_leads: number; total_emails: number; status: string }> {

  // 1. Load campaign + steps + account
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select(`
      id, name, batch_id, sending_account_id, status,
      campaign_sequence_steps (
        id, step_number, subject_template, body_template,
        delay_days, use_ai, ai_tone
      ),
      sending_accounts (id, from_name, from_email, daily_limit)
    `)
    .eq('id', campaignId)
    .eq('workspace_id', workspaceId)
    .single()

  if (campErr || !campaign) {
    throw new Error(`Campaign not found: ${campErr?.message}`)
  }

  if (!campaign.batch_id) throw new Error('Campaign has no batch')
  if (!campaign.sending_account_id) throw new Error('Campaign has no sending account')

  const steps = (campaign.campaign_sequence_steps as Array<{
    id: string; step_number: number; subject_template: string
    body_template: string; delay_days: number; use_ai: boolean; ai_tone: string
  }>).sort((a, b) => a.step_number - b.step_number)

  if (steps.length === 0) throw new Error('Campaign has no steps')

  const account = campaign.sending_accounts as {
    id: string; from_name: string; from_email: string; daily_limit: number
  }

  const campaignStart = new Date(startAt)

  // 2. Fetch eligible leads
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, company, title, website')
    .eq('batch_id', campaign.batch_id)
    .eq('workspace_id', workspaceId)
    .eq('is_unsubscribed', false)
    .eq('is_dnc', false)
    .not('email', 'is', null)
    .limit(MAX_LEADS_PER_CAMPAIGN)

  if (leadsErr) throw new Error(`Failed to load leads: ${leadsErr.message}`)

  const eligibleLeads = (leads ?? []) as Array<{
    id: string; first_name: string | null; last_name: string | null
    email: string; company: string | null; title: string | null; website: string | null
  }>

  if (eligibleLeads.length === 0) {
    await supabase.from('campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', campaignId)
    return { total_leads: 0, total_emails: 0, status: 'completed' }
  }

  // 3. Generate email + queue rows
  const emailRows: Record<string, unknown>[]     = []
  const queueRows: Record<string, unknown>[]     = []

  for (let leadIdx = 0; leadIdx < eligibleLeads.length; leadIdx++) {
    const lead = eligibleLeads[leadIdx]

    for (const step of steps) {
      const jitterSeed    = (leadIdx * steps.length + step.step_number) / (eligibleLeads.length * steps.length)
      const scheduledFor  = calcScheduledFor(campaignStart, step.delay_days, jitterSeed)

      // Merge variables into subject/body (unless AI will personalise)
      const mergeCtx = buildMergeContext(lead, account)
      const subject  = step.use_ai ? step.subject_template : applyMergeVars(step.subject_template, mergeCtx)
      const body     = step.use_ai ? step.body_template     : applyMergeVars(step.body_template,    mergeCtx)

      const emailId = crypto.randomUUID()

      emailRows.push({
        id:                 emailId,
        workspace_id:       workspaceId,
        lead_id:            lead.id,
        campaign_id:        campaignId,
        step_number:        step.step_number,
        sending_account_id: account.id,
        sent_by:            null,
        subject,
        body_html:          body,
        status:             'queued',
        scheduled_for:      scheduledFor.toISOString(),
        ai_personalised:    step.use_ai,
      })

      queueRows.push({
        email_id:           emailId,
        campaign_id:        campaignId,
        sending_account_id: account.id,
        scheduled_for:      scheduledFor.toISOString(),
        attempts:           0,
      })
    }
  }

  // 4. Batch insert emails
  for (let i = 0; i < emailRows.length; i += BATCH_INSERT_SIZE) {
    const chunk = emailRows.slice(i, i + BATCH_INSERT_SIZE)
    const { error } = await supabase.from('emails').insert(chunk)
    if (error) throw new Error(`Email insert failed at chunk ${i}: ${error.message}`)
  }

  // 5. Batch insert queue rows
  for (let i = 0; i < queueRows.length; i += BATCH_INSERT_SIZE) {
    const chunk = queueRows.slice(i, i + BATCH_INSERT_SIZE)
    const { error } = await supabase.from('email_queue').insert(chunk)
    if (error) throw new Error(`Queue insert failed at chunk ${i}: ${error.message}`)
  }

  // 6. Update campaign stats
  const isScheduled = campaignStart > new Date()
  await supabase
    .from('campaigns')
    .update({
      status:      isScheduled ? 'scheduled' : 'running',
      started_at:  isScheduled ? null : new Date().toISOString(),
      total_leads: eligibleLeads.length,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', campaignId)

  console.log(`[process-campaign] ${campaignId}: ${eligibleLeads.length} leads × ${steps.length} steps = ${emailRows.length} emails`)

  return {
    total_leads:  eligibleLeads.length,
    total_emails: emailRows.length,
    status:       isScheduled ? 'scheduled' : 'running',
  }
}

// ── Scheduling helpers ────────────────────────────────────────────────────
function calcScheduledFor(campaignStart: Date, delayDays: number, jitterSeed: number): Date {
  const base = new Date(campaignStart)
  base.setUTCDate(base.getUTCDate() + delayDays)

  const hour = base.getUTCHours()
  if (hour < SEND_WINDOW_START) {
    base.setUTCHours(SEND_WINDOW_START, 0, 0, 0)
  } else if (hour >= SEND_WINDOW_END) {
    base.setUTCDate(base.getUTCDate() + 1)
    base.setUTCHours(SEND_WINDOW_START, 0, 0, 0)
  }

  const windowMinutes = (SEND_WINDOW_END - SEND_WINDOW_START) * 60
  const jitter        = Math.floor(jitterSeed * Math.min(JITTER_MAX_MINUTES, windowMinutes))
  base.setUTCMinutes(base.getUTCMinutes() + jitter)
  return base
}

// ── Merge variable helpers ────────────────────────────────────────────────
function applyMergeVars(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => ctx[key] ?? `{{${key}}}`)
}

function buildMergeContext(
  lead: { first_name: string | null; last_name: string | null; email: string; company: string | null; title: string | null; website: string | null },
  sender: { from_name: string; from_email: string },
): Record<string, string> {
  const first = lead.first_name ?? ''
  const last  = lead.last_name  ?? ''
  return {
    first_name:   first,
    last_name:    last,
    full_name:    [first, last].filter(Boolean).join(' '),
    email:        lead.email,
    company:      lead.company  ?? '',
    title:        lead.title    ?? '',
    website:      lead.website  ?? '',
    sender_name:  sender.from_name,
    sender_email: sender.from_email,
  }
}

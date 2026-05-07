/**
 * supabase/functions/process-ai-batch/index.ts
 *
 * Deno Edge Function: Batch AI email personalisation.
 *
 * Triggered by POST /api/ai/batch-personalise with { job_id }.
 *
 * Algorithm:
 *  1. Load job + campaign + step details
 *  2. Mark job as 'running'
 *  3. For each lead in the campaign's batch (chunks of 10):
 *     a. Check budget; abort if exhausted
 *     b. Call OpenAI (gpt-4o-mini) with lead + step template
 *     c. Update the emails row with personalised content
 *     d. Log usage
 *     e. Update job progress
 *     f. Wait 500ms between chunks
 *  4. Mark job 'completed' (or 'failed')
 *
 * Cost: ~$0.04 for 100 leads at gpt-4o-mini rates.
 */

// deno-lint-ignore-file no-explicit-any
import { serve }           from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient }    from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI              from 'https://esm.sh/openai@4'

const CHUNK_SIZE    = 10
const CHUNK_DELAY   = 500   // ms between chunks
const MAX_TOKENS    = 450
const BATCH_MODEL   = 'gpt-4o-mini'

const TONE_DESCRIPTORS: Record<string, string> = {
  professional: 'professional, concise, and respectful',
  casual:       'casual and conversational',
  direct:       'direct and to-the-point, no fluff',
  friendly:     'warm and friendly',
}

function calcCostUsd(promptTokens: number, completionTokens: number): number {
  return (promptTokens / 1_000_000) * 0.15 + (completionTokens / 1_000_000) * 0.60
}

serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let jobId: string
  try {
    const body = await req.json() as { job_id: string }
    jobId      = body.job_id
    if (!jobId) throw new Error('Missing job_id')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid body — expected { job_id }' }), { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase    = createClient(supabaseUrl, serviceKey!)
  const openai      = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') })

  // ── Load job ────────────────────────────────────────────────────────────
  const { data: job } = await supabase
    .from('ai_batch_jobs')
    .select('*, campaigns!inner(id, workspace_id, batch_id, sending_account_id)')
    .eq('id', jobId)
    .single() as { data: any }

  if (!job) {
    return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 })
  }
  if (job.status === 'completed') {
    return new Response(JSON.stringify({ message: 'Job already completed' }), { status: 200 })
  }

  const campaign     = job.campaigns
  const workspaceId  = campaign.workspace_id

  // ── Load campaign step ──────────────────────────────────────────────────
  const { data: step } = await supabase
    .from('campaign_sequence_steps')
    .select('*')
    .eq('campaign_id', campaign.id)
    .eq('step_number', job.step_number)
    .single() as { data: any }

  if (!step) {
    await supabase.from('ai_batch_jobs').update({ status: 'failed', error: 'Campaign step not found' }).eq('id', jobId)
    return new Response(JSON.stringify({ error: 'Step not found' }), { status: 404 })
  }

  // ── Load sending account ────────────────────────────────────────────────
  const { data: account } = await supabase
    .from('sending_accounts')
    .select('from_name, from_email')
    .eq('id', campaign.sending_account_id)
    .single() as { data: { from_name: string; from_email: string } | null }

  // ── Load workspace name ─────────────────────────────────────────────────
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .single() as { data: { name: string } | null }

  const sender = {
    name:    account?.from_name  ?? 'The Team',
    email:   account?.from_email ?? '',
    company: workspace?.name     ?? 'our company',
  }

  // ── Load eligible leads ─────────────────────────────────────────────────
  const { data: leads } = await supabase
    .from('leads')
    .select('id, first_name, last_name, title, company, website, email')
    .eq('batch_id', campaign.batch_id)
    .eq('is_suppressed', false)
    .is('deleted_at', null) as { data: any[] | null }

  const eligibleLeads = leads ?? []
  const total         = eligibleLeads.length

  // ── Mark job as running ─────────────────────────────────────────────────
  await supabase.from('ai_batch_jobs').update({
    status:     'running',
    total,
    processed:  0,
    started_at: new Date().toISOString(),
  }).eq('id', jobId)

  // ── Budget check ────────────────────────────────────────────────────────
  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const { data: budgetSettings } = await supabase
    .from('workspace_settings')
    .select('ai_monthly_token_budget')
    .eq('workspace_id', workspaceId)
    .single() as { data: { ai_monthly_token_budget: number } | null }

  const budget = budgetSettings?.ai_monthly_token_budget ?? 1_000_000

  const { data: usageData } = await supabase
    .from('ai_usage_logs')
    .select('total_tokens')
    .eq('workspace_id', workspaceId)
    .gte('created_at', startOfMonth.toISOString())
    .eq('cached', false) as { data: Array<{ total_tokens: number }> | null }

  let usedTokens = (usageData ?? []).reduce((s: number, r: any) => s + r.total_tokens, 0)

  // ── Process in chunks ───────────────────────────────────────────────────
  let processed    = 0
  let failedCount  = 0
  const tone       = step.ai_tone ?? 'professional'
  const toneDesc   = TONE_DESCRIPTORS[tone] ?? tone
  const templateBody = step.body_template ?? ''

  for (let i = 0; i < eligibleLeads.length; i += CHUNK_SIZE) {
    const chunk = eligibleLeads.slice(i, i + CHUNK_SIZE)

    // Budget guard: estimate remaining tokens needed
    const remaining = (eligibleLeads.length - i) * 600
    if (usedTokens + remaining > budget * 1.05) {  // 5% grace over hard limit
      await supabase.from('ai_batch_jobs').update({
        status:       'failed',
        error:        `Stopped at ${processed}/${total}: monthly AI token budget reached.`,
        processed,
        failed_count: failedCount,
      }).eq('id', jobId)
      return new Response(JSON.stringify({ stopped: 'budget_exhausted', processed }), { status: 200 })
    }

    const chunkResults = await Promise.allSettled(
      chunk.map(async (lead: any) => {
        const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'there'

        const systemPrompt =
          `You are a cold outreach copywriter. Write a personalised cold email in a ${toneDesc} tone.
Rules: max 120 words, personalise to the specific person, no generic phrases, one clear CTA.
Output JSON: { "subject": "string", "body_html": "string", "body_text": "string" }`

        const userPrompt =
          `Sender: ${sender.name} <${sender.email}> at ${sender.company}
Lead: ${leadName} — ${lead.title ?? ''} at ${lead.company ?? ''}
${lead.website ? `Website: ${lead.website}` : ''}
${templateBody ? `Base template:\n${templateBody.slice(0, 400)}` : ''}`

        const response = await openai.chat.completions.create({
          model:           BATCH_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
          response_format: { type: 'json_object' },
          max_tokens:      MAX_TOKENS,
          temperature:     0.7,
        })

        const content = response.choices[0]?.message?.content
        if (!content) throw new Error('Empty OpenAI response')

        const draft = JSON.parse(content)

        const promptTokens     = response.usage?.prompt_tokens     ?? 0
        const completionTokens = response.usage?.completion_tokens ?? 0
        const totalTokens      = response.usage?.total_tokens      ?? 0

        // Update the email row for this lead + campaign step
        await supabase
          .from('emails')
          .update({
            subject:          draft.subject?.trim()   ?? '',
            body_html:        draft.body_html?.trim() ?? '',
            ai_personalised:  true,
          })
          .eq('campaign_id', campaign.id)
          .eq('lead_id',     lead.id)
          .eq('step_number', step.step_number)

        // Log token usage
        await supabase.from('ai_usage_logs').insert({
          workspace_id:      workspaceId,
          user_id:           '00000000-0000-0000-0000-000000000000',  // system user
          model:             BATCH_MODEL,
          task:              'batch_email',
          lead_id:           lead.id,
          campaign_id:       campaign.id,
          prompt_tokens:     promptTokens,
          completion_tokens: completionTokens,
          total_tokens:      totalTokens,
          cost_usd:          calcCostUsd(promptTokens, completionTokens),
          cached:            false,
        })

        usedTokens += totalTokens
        return totalTokens
      })
    )

    for (const r of chunkResults) {
      if (r.status === 'fulfilled') processed++
      else failedCount++
    }

    // Update progress
    await supabase.from('ai_batch_jobs').update({
      processed,
      failed_count: failedCount,
    }).eq('id', jobId)

    // Rate-limit safety delay between chunks
    if (i + CHUNK_SIZE < eligibleLeads.length) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY))
    }
  }

  // ── Mark complete ────────────────────────────────────────────────────────
  const finalStatus = failedCount > 0 && processed === 0 ? 'failed' : 'completed'
  await supabase.from('ai_batch_jobs').update({
    status:       finalStatus,
    processed,
    failed_count: failedCount,
    completed_at: new Date().toISOString(),
    error:        failedCount > 0 ? `${failedCount} leads failed to personalise` : null,
  }).eq('id', jobId)

  // Notify workspace admins if batch completed
  if (finalStatus === 'completed') {
    await supabase.from('notifications').insert({
      workspace_id: workspaceId,
      type:         'ai_batch_complete',
      title:        'AI personalisation complete',
      body:         `Personalised ${processed} emails for campaign step ${step.step_number}.`,
      is_read:      false,
    })
  }

  return new Response(
    JSON.stringify({ status: finalStatus, processed, failed: failedCount }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})

/**
 * POST /api/ai/batch-personalise
 *
 * Creates an ai_batch_jobs row and asynchronously triggers the
 * process-ai-batch Edge Function to personalise all emails for
 * a given campaign step.
 *
 * Required role: manager+
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { isAiEnabled, checkBudget } from '@/lib/ai'

const schema = z.object({
  campaign_id: z.string().uuid(),
  step_number: z.number().int().min(1),
})

export async function POST(req: Request) {
  try {
    if (!isAiEnabled()) {
      return NextResponse.json({ error: 'AI features are not enabled' }, { status: 503 })
    }

    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body   = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    const { campaign_id, step_number } = parsed.data
    const adminClient = createAdminClient()

    const { data: member } = await adminClient
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['manager', 'admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Manager or admin role required' }, { status: 403 })
    }

    // Budget check (rough estimate: 600 tokens per lead)
    const budget = await checkBudget(member.workspace_id)
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Monthly AI token budget reached.' }, { status: 429 })
    }

    // Validate campaign belongs to workspace
    const { data: campaign } = await adminClient
      .from('campaigns')
      .select('id, status, batch_id')
      .eq('id', campaign_id)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: { id: string; status: string; batch_id: string } | null }

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
      return NextResponse.json({
        error: `Cannot personalise a campaign in "${campaign.status}" status.`
      }, { status: 409 })
    }

    // Count leads for cost estimate
    const { count: leadCount } = await adminClient
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', campaign.batch_id)
      .is('unsubscribed', false) as { count: number | null }

    const total = leadCount ?? 0

    // Upsert batch job (idempotent — allows re-triggering)
    const { data: job, error: jobErr } = await adminClient
      .from('ai_batch_jobs')
      .upsert({
        workspace_id: member.workspace_id,
        campaign_id,
        step_number,
        status:       'pending',
        total,
        processed:    0,
        failed_count: 0,
        error:        null,
      }, { onConflict: 'campaign_id,step_number' })
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }

    if (jobErr || !job) {
      return NextResponse.json({ error: 'Failed to create batch job' }, { status: 500 })
    }

    // Fire-and-forget: trigger Edge Function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl) {
      fetch(`${supabaseUrl}/functions/v1/process-ai-batch`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ job_id: job.id }),
      }).catch((err) => console.error('[batch-personalise] Edge Function trigger failed:', err))
    }

    return NextResponse.json({
      job_id:         job.id,
      status:         'pending',
      total,
      cost_estimate:  `~$${((total * 600) / 1_000_000 * 0.15).toFixed(4)}`,
      budget_used_pct: budget.used_pct,
    }, { status: 202 })
  } catch (err) {
    console.error('[POST /api/ai/batch-personalise]', err)
    return NextResponse.json({ error: 'Failed to start batch personalisation.' }, { status: 500 })
  }
}

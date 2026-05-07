/**
 * POST /api/ai/follow-up
 *
 * Suggests optimal follow-up timing and generates a follow-up email draft
 * based on a lead's recent activity history.
 * Uses gpt-4o-mini.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { isAiEnabled, generateFollowUp, checkBudget, logUsage } from '@/lib/ai'

const schema = z.object({
  lead_id: z.string().uuid(),
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

    const { lead_id } = parsed.data
    const adminClient  = createAdminClient()

    const { data: member } = await adminClient
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const budget = await checkBudget(member.workspace_id)
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Monthly AI token budget reached.' }, { status: 429 })
    }

    // Load lead + recent activity
    const [{ data: lead }, { data: activities }] = await Promise.all([
      adminClient
        .from('leads')
        .select('first_name, last_name, title, company, website, email')
        .eq('id', lead_id)
        .eq('workspace_id', member.workspace_id)
        .single(),
      adminClient
        .from('activities')
        .select('type, created_at, metadata')
        .eq('lead_id', lead_id)
        .order('created_at', { ascending: false })
        .limit(8),
    ]) as [
      { data: { first_name: string | null; last_name: string | null; title: string | null; company: string | null; website: string | null; email: string } | null },
      { data: Array<{ type: string; created_at: string; metadata: Record<string, unknown> | null }> | null }
    ]

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const activityHistory = (activities ?? [])
      .map((a) => {
        const meta = a.metadata
        const extra = meta && typeof meta === 'object'
          ? Object.entries(meta as Record<string, unknown>)
              .filter(([k]) => ['status', 'subject'].includes(k))
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')
          : ''
        return `- ${a.type}${extra ? ` (${extra})` : ''}: ${a.created_at.slice(0, 10)}`
      })
      .join('\n')

    const result = await generateFollowUp({
      lead: { ...lead, linkedin: null },
      activityHistory,
    })

    void logUsage({
      workspaceId:      member.workspace_id,
      userId:           user.id,
      model:            'gpt-4o-mini',
      task:             'follow_up',
      leadId:           lead_id,
      promptTokens:     result.usage.prompt,
      completionTokens: result.usage.completion,
      cached:           result.cached,
    })

    return NextResponse.json({
      suggested_days: result.suggested_days,
      reason:         result.reason,
      subject:        result.subject,
      body_text:      result.body_text,
      tokens_used:    result.tokens_used,
      cached:         result.cached,
    })
  } catch (err) {
    console.error('[POST /api/ai/follow-up]', err)
    return NextResponse.json({ error: 'Follow-up suggestion failed.' }, { status: 500 })
  }
}

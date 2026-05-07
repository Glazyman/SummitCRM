/**
 * GET /api/admin/ai-usage
 * AI token budget widget data (current month).
 * Required: admin+
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { BUDGET_DEFAULT } from '@/lib/ai/types'

export async function GET(_req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = createAdminClient()
    const { data: member } = await adminClient
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    }

    const startOfMonth = new Date()
    startOfMonth.setUTCDate(1)
    startOfMonth.setUTCHours(0, 0, 0, 0)

    const [usageRes, settingsRes] = await Promise.all([
      adminClient
        .from('ai_usage_logs')
        .select('total_tokens, cost_usd')
        .eq('workspace_id', member.workspace_id)
        .gte('created_at', startOfMonth.toISOString())
        .eq('cached', false),
      adminClient
        .from('workspace_settings')
        .select('ai_monthly_token_budget')
        .eq('workspace_id', member.workspace_id)
        .single(),
    ]) as [
      { data: Array<{ total_tokens: number; cost_usd: number }> | null },
      { data: { ai_monthly_token_budget: number } | null }
    ]

    const rows   = usageRes.data     ?? []
    const budget = settingsRes.data?.ai_monthly_token_budget ?? BUDGET_DEFAULT
    const tokens = rows.reduce((s, r) => s + r.total_tokens, 0)
    const cost   = rows.reduce((s, r) => s + r.cost_usd,      0)

    return NextResponse.json({
      total_tokens:    tokens,
      total_cost_usd:  Math.round(cost * 10000) / 10000,
      total_calls:     rows.length,
      budget,
      budget_used_pct: budget > 0 ? Math.round((tokens / budget) * 100) : 0,
    })
  } catch (err) {
    console.error('[GET /api/admin/ai-usage]', err)
    return NextResponse.json({ error: 'Failed to load AI usage' }, { status: 500 })
  }
}

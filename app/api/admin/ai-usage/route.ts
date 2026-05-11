/**
 * GET /api/admin/ai-usage
 *
 * Admin-only. Returns month-to-date totals + the 50 most recent
 * snapshot-email generations for the workspace. Used by /settings/ai-usage.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import type { UsageRow, UsageSummary, AiModel } from '@/lib/ai'

export async function GET(_req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient() as unknown as {
      from: (t: string) => any  // eslint-disable-line @typescript-eslint/no-explicit-any
      auth: { admin: { listUsers: () => Promise<{ data: { users: Array<{ id: string; email?: string | null; user_metadata?: { full_name?: string } }> } }> } }
    }

    const { data: member } = await admin
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member || !['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
    }

    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)

    // Month aggregate + recent rows in parallel.
    const [aggRes, recentRes, usersRes] = await Promise.all([
      admin
        .from('ai_usage_logs')
        .select('total_tokens, cost_usd')
        .eq('workspace_id', member.workspace_id)
        .gte('created_at', monthStart.toISOString()),
      admin
        .from('ai_usage_logs')
        .select('id, created_at, user_id, lead_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd')
        .eq('workspace_id', member.workspace_id)
        .order('created_at', { ascending: false })
        .limit(50),
      admin.auth.admin.listUsers(),
    ])

    const aggRows = (aggRes.data ?? []) as Array<{ total_tokens: number; cost_usd: number }>
    const monthTotals = aggRows.reduce(
      (acc, r) => {
        acc.tokens += r.total_tokens
        acc.usd    += Number(r.cost_usd)
        return acc
      },
      { tokens: 0, usd: 0 },
    )

    const usersById = new Map(
      (usersRes.data?.users ?? []).map((u) => [
        u.id,
        (u.user_metadata?.full_name ?? u.email ?? u.id) as string,
      ]),
    )

    type RawRow = {
      id: string; created_at: string; user_id: string; lead_id: string | null
      model: AiModel; prompt_tokens: number; completion_tokens: number
      total_tokens: number; cost_usd: number
    }
    const recentRaw = (recentRes.data ?? []) as RawRow[]

    // Resolve lead company names in one query.
    const leadIds = Array.from(new Set(recentRaw.map((r) => r.lead_id).filter((id): id is string => Boolean(id))))
    const companyByLeadId = new Map<string, string | null>()
    if (leadIds.length > 0) {
      const { data: leads } = await admin
        .from('leads')
        .select('id, company')
        .in('id', leadIds) as { data: Array<{ id: string; company: string | null }> | null }
      for (const l of leads ?? []) companyByLeadId.set(l.id, l.company)
    }

    const recent: UsageRow[] = recentRaw.map((r) => ({
      id:                r.id,
      created_at:        r.created_at,
      user_id:           r.user_id,
      user_name:         usersById.get(r.user_id) ?? null,
      lead_id:           r.lead_id,
      lead_company:      r.lead_id ? (companyByLeadId.get(r.lead_id) ?? null) : null,
      model:             r.model,
      prompt_tokens:     r.prompt_tokens,
      completion_tokens: r.completion_tokens,
      total_tokens:      r.total_tokens,
      cost_usd:          Number(r.cost_usd),
    }))

    const summary: UsageSummary = {
      month_total_calls:  aggRows.length,
      month_total_tokens: monthTotals.tokens,
      month_total_usd:    monthTotals.usd,
      recent,
    }

    return NextResponse.json(summary)
  } catch (err) {
    console.error('[GET /api/admin/ai-usage]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

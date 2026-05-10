/**
 * GET /api/admin/overview
 * Workspace-level KPI summary for the selected date range.
 * Required: admin+
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

function dateRange(preset: string | null): { start: string; end: string } {
  const now   = new Date()
  const end   = now.toISOString()
  let   start = new Date(now)

  if (preset === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (preset === '7d') {
    start.setDate(start.getDate() - 7)
  } else if (preset === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
  } else {
    // default: 30d
    start.setDate(start.getDate() - 30)
  }

  return { start: start.toISOString(), end }
}

export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url)
    const range = dateRange(searchParams.get('range'))

    const wsId = member.workspace_id

    // Parallel queries
    const [emailsRes, leadsRes, leadsNewRes, campaignsRes, aiRes, accountsRes, interestedRes, contactedRes, statusesRes, unassignedRes] =
      await Promise.all([
        adminClient
          .from('emails')
          .select('status')
          .eq('workspace_id', wsId)
          .gte('created_at', range.start)
          .lte('created_at', range.end),

        adminClient
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId)
          .is('deleted_at', null),

        adminClient
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId)
          .gte('created_at', range.start)
          .is('deleted_at', null),

        adminClient
          .from('campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId)
          .in('status', ['running', 'scheduled']),

        adminClient
          .from('ai_usage_logs')
          .select('total_tokens, cost_usd')
          .eq('workspace_id', wsId)
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
          .eq('cached', false),

        adminClient
          .from('sending_accounts')
          .select('id, name, from_email, type, emails_sent_today, daily_limit, is_active')
          .eq('workspace_id', wsId)
          .eq('is_active', true),

        // interested leads
        adminClient
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId)
          .eq('interest_status', 'interested')
          .is('deleted_at', null),

        // contacted leads (reached at least once)
        adminClient
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId)
          .in('status', ['called', 'voicemail', 'no_answer', 'emailed', 'contacted', 'replied'])
          .is('deleted_at', null),

        // all lead statuses for breakdown
        adminClient
          .from('leads')
          .select('status')
          .eq('workspace_id', wsId)
          .is('deleted_at', null),

        // unassigned leads
        adminClient
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId)
          .is('assigned_to', null)
          .is('deleted_at', null),
      ]) as [
        { data: Array<{ status: string }> | null },
        { count: number | null },
        { count: number | null },
        { count: number | null },
        { data: Array<{ total_tokens: number; cost_usd: number }> | null },
        { data: Array<{ id: string; name: string; from_email: string; type: string; emails_sent_today: number; daily_limit: number; is_active: boolean }> | null },
        { count: number | null },
        { count: number | null },
        { data: Array<{ status: string }> | null },
        { count: number | null },
      ]

    // Calls count (separate query — join syntax may vary)
    let callsCount = 0
    try {
      const callsRes = await adminClient
        .from('activities')
        .select('id, leads!inner(workspace_id)', { count: 'exact', head: true })
        .eq('leads.workspace_id', wsId)
        .eq('type', 'call_logged')
        .gte('created_at', range.start)
        .lte('created_at', range.end)
      callsCount = callsRes.count ?? 0
    } catch {}

    const emails      = emailsRes.data     ?? []
    const sent        = emails.filter((e) => e.status !== 'queued')
    const opened      = emails.filter((e) => e.status === 'opened')
    const replied     = emails.filter((e) => e.status === 'replied')
    const bounced     = emails.filter((e) => e.status === 'bounced')
    const sentCount   = sent.length
    const openRate    = sentCount > 0 ? Math.round((opened.length  / sentCount) * 1000) / 10 : 0
    const replyRate   = sentCount > 0 ? Math.round((replied.length / sentCount) * 1000) / 10 : 0
    const bounceRate  = sentCount > 0 ? Math.round((bounced.length / sentCount) * 1000) / 10 : 0

    const aiRows      = aiRes.data ?? []
    const aiTokens    = aiRows.reduce((s, r) => s + r.total_tokens, 0)
    const aiCost      = aiRows.reduce((s, r) => s + r.cost_usd, 0)

    // Build lead status breakdown
    const statusRows = statusesRes.data ?? []
    const lead_status_counts: Record<string, number> = {}
    for (const row of statusRows) {
      lead_status_counts[row.status] = (lead_status_counts[row.status] ?? 0) + 1
    }

    const accounts    = accountsRes.data ?? []
    const quotaWarnings = accounts
      .filter((a) => a.daily_limit > 0 && (a.emails_sent_today / a.daily_limit) >= 0.8)
      .map((a) => ({
        id: a.id, name: a.name, from_email: a.from_email, type: a.type,
        emails_sent_today: a.emails_sent_today, daily_limit: a.daily_limit,
        quota_pct: Math.round((a.emails_sent_today / a.daily_limit) * 100),
        bounces_7d: 0, failures_7d: 0, is_active: a.is_active,
      }))

    return NextResponse.json({
      date_range:       range,
      totals: {
        emails_sent:      sentCount,
        open_rate:        openRate,
        reply_rate:       replyRate,
        bounce_rate:      bounceRate,
        active_leads:     leadsRes.count     ?? 0,
        new_leads_period: leadsNewRes.count  ?? 0,
        interested_leads: interestedRes.count  ?? 0,
        calls_period:     callsCount,
        leads_contacted:  contactedRes.count   ?? 0,
        unassigned_leads: unassignedRes.count  ?? 0,
      },
      quota_warnings:     quotaWarnings,
      active_campaigns:   campaignsRes.count ?? 0,
      ai_tokens_month:    aiTokens,
      ai_cost_usd:        Math.round(aiCost * 10000) / 10000,
      lead_status_counts,
    })
  } catch (err) {
    console.error('[GET /api/admin/overview]', err)
    return NextResponse.json({ error: 'Failed to load overview' }, { status: 500 })
  }
}

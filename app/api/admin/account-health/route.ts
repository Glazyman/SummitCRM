/**
 * GET /api/admin/account-health
 * Sending account quota + bounce/failure health.
 * Required: admin+
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

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

    const wsId      = member.workspace_id
    const sevenDays = new Date(Date.now() - 7 * 86400000).toISOString()

    const [accountsRes, emailsRes] = await Promise.all([
      adminClient
        .from('sending_accounts')
        .select('id, name, from_email, type, emails_sent_today, daily_limit, is_active')
        .eq('workspace_id', wsId),

      adminClient
        .from('emails')
        .select('sending_account_id, status')
        .eq('workspace_id', wsId)
        .gte('created_at', sevenDays)
        .in('status', ['bounced', 'failed']),
    ]) as [
      { data: Array<{ id: string; name: string; from_email: string; type: string; emails_sent_today: number; daily_limit: number; is_active: boolean }> | null },
      { data: Array<{ sending_account_id: string | null; status: string }> | null }
    ]

    const accounts = accountsRes.data ?? []
    const emails   = emailsRes.data   ?? []

    // Count bounces/failures per account
    const countsByAccount = new Map<string, { bounces: number; failures: number }>()
    for (const e of emails) {
      if (!e.sending_account_id) continue
      const cur = countsByAccount.get(e.sending_account_id) ?? { bounces: 0, failures: 0 }
      if (e.status === 'bounced') cur.bounces++
      if (e.status === 'failed')  cur.failures++
      countsByAccount.set(e.sending_account_id, cur)
    }

    const health = accounts.map((a) => {
      const counts   = countsByAccount.get(a.id) ?? { bounces: 0, failures: 0 }
      const quotaPct = a.daily_limit > 0
        ? Math.round((a.emails_sent_today / a.daily_limit) * 100)
        : 0

      return {
        id:                a.id,
        name:              a.name,
        from_email:        a.from_email,
        type:              a.type,
        emails_sent_today: a.emails_sent_today,
        daily_limit:       a.daily_limit,
        quota_pct:         quotaPct,
        bounces_7d:        counts.bounces,
        failures_7d:       counts.failures,
        is_active:         a.is_active,
      }
    }).sort((a, b) => b.quota_pct - a.quota_pct)

    return NextResponse.json({ accounts: health })
  } catch (err) {
    console.error('[GET /api/admin/account-health]', err)
    return NextResponse.json({ error: 'Failed to load account health' }, { status: 500 })
  }
}

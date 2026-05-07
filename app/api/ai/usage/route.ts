/**
 * GET /api/ai/usage
 *
 * Returns token usage summary for the current workspace.
 * Required role: admin+
 *
 * Query params:
 *  - months: number of months to include (default 1, max 12)
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { getUsageSummary } from '@/lib/ai'

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
    const months = Math.min(12, Math.max(1, parseInt(searchParams.get('months') ?? '1', 10)))

    const summary = await getUsageSummary(member.workspace_id, months)

    return NextResponse.json(summary)
  } catch (err) {
    console.error('[GET /api/ai/usage]', err)
    return NextResponse.json({ error: 'Failed to fetch usage data.' }, { status: 500 })
  }
}

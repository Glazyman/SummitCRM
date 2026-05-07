/**
 * GET /api/sending-accounts/[id]/quota
 * Returns quota status for a single sending account.
 * Auth: rep+
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { getQuotaStatus } from '@/lib/email/quota'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id: accountId } = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single() as { data: { workspace_id: string } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    // Verify account belongs to workspace
    const { data: acct } = await supabase
      .from('sending_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: { id: string } | null; error: unknown }

    if (!acct) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const quota = await getQuotaStatus(supabase, accountId)
    return NextResponse.json({ quota })
  } catch (err) {
    console.error('[quota GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

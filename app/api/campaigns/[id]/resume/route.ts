import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params
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
    if (!['admin', 'super_admin', 'manager'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { data: campaign } = await adminClient
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: { id: string; status: string } | null }

    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (campaign.status !== 'paused') {
      return NextResponse.json({ error: 'Only paused campaigns can be resumed' }, { status: 409 })
    }

    await adminClient
      .from('campaigns')
      .update({ status: 'running', paused_at: null, updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({ success: true, status: 'running' })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * POST /api/campaigns/[id]/start
 *
 * Validates the campaign, then calls the `process-campaign` Edge Function
 * to expand leads → email rows and kick off sending.
 * Returns immediately; the Edge Function runs asynchronously.
 */
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

    // Load campaign + validate
    const { data: campaign } = await adminClient
      .from('campaigns')
      .select('id, status, batch_id, sending_account_id, scheduled_start, name')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .single() as {
        data: {
          id: string; status: string; batch_id: string | null
          sending_account_id: string | null; scheduled_start: string | null; name: string
        } | null
      }

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return NextResponse.json({ error: `Cannot start a ${campaign.status} campaign` }, { status: 409 })
    }
    if (!campaign.batch_id)           return NextResponse.json({ error: 'Campaign has no batch assigned' }, { status: 400 })
    if (!campaign.sending_account_id) return NextResponse.json({ error: 'Campaign has no sending account' }, { status: 400 })

    // Check the campaign has at least one step
    const { count: stepCount } = await adminClient
      .from('campaign_sequence_steps')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', id) as { count: number | null }

    if (!stepCount || stepCount < 1) {
      return NextResponse.json({ error: 'Campaign must have at least one sequence step' }, { status: 400 })
    }

    // Check batch has eligible leads
    const { count: leadCount } = await adminClient
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('batch_id', campaign.batch_id)
      .eq('is_unsubscribed', false)
      .eq('is_dnc', false)
      .not('email', 'is', null) as { count: number | null }

    if (!leadCount || leadCount < 1) {
      return NextResponse.json({ error: 'No eligible leads in batch (all unsubscribed or DNC)' }, { status: 400 })
    }

    // Determine actual start time
    const startAt = campaign.scheduled_start
      ? new Date(campaign.scheduled_start)
      : new Date()

    const isScheduled = startAt > new Date()

    // Optimistically mark campaign as scheduled/running
    await adminClient
      .from('campaigns')
      .update({
        status:     isScheduled ? 'scheduled' : 'running',
        started_at: isScheduled ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    // Call the Edge Function to expand leads → email rows (fire-and-forget)
    const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-campaign`
    fetch(edgeFnUrl, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        campaign_id: id,
        workspace_id: member.workspace_id,
        start_at:    startAt.toISOString(),
      }),
    }).catch((err) => console.error('[start campaign] edge fn call failed:', err))

    return NextResponse.json({
      success:     true,
      status:      isScheduled ? 'scheduled' : 'running',
      lead_count:  leadCount,
      starts_at:   startAt.toISOString(),
    })
  } catch (err) {
    console.error('[POST /api/campaigns/[id]/start]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

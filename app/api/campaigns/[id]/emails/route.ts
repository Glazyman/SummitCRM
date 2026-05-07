import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const url     = new URL(req.url)
    const page    = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
    const perPage = Math.min(100, parseInt(url.searchParams.get('per_page') ?? '50'))
    const step    = url.searchParams.get('step')     // filter by step number
    const status  = url.searchParams.get('status')   // filter by email status

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

    // Verify campaign
    const { data: campaign } = await adminClient
      .from('campaigns')
      .select('id')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: { id: string } | null }

    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Build query
    let query = adminClient
      .from('emails')
      .select(`
        id, step_number, subject, status,
        sent_at, opened_at, clicked_at, replied_at, bounced_at,
        leads (id, first_name, last_name, email)
      `, { count: 'exact' })
      .eq('campaign_id', id)
      .order('sent_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1)

    if (step)   query = query.eq('step_number', parseInt(step))
    if (status) query = query.eq('status', status)

    const { data: emails, count, error } = await query as {
      data: Array<{
        id: string; step_number: number | null; subject: string
        status: string; sent_at: string | null; opened_at: string | null
        clicked_at: string | null; replied_at: string | null; bounced_at: string | null
        leads: { id: string; first_name: string | null; last_name: string | null; email: string } | null
      }> | null
      count: number | null
      error: unknown
    }

    if (error) throw error

    const rows = (emails ?? []).map((e) => ({
      email_id:    e.id,
      lead_id:     e.leads?.id ?? '',
      lead_name:   [e.leads?.first_name, e.leads?.last_name].filter(Boolean).join(' ') || null,
      lead_email:  e.leads?.email ?? '',
      step_number: e.step_number ?? 1,
      subject:     e.subject,
      status:      e.status,
      sent_at:     e.sent_at,
      opened_at:   e.opened_at,
      clicked_at:  e.clicked_at,
      replied_at:  e.replied_at,
      bounced_at:  e.bounced_at,
    }))

    return NextResponse.json({
      emails:  rows,
      total:   count ?? 0,
      page,
      per_page:perPage,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

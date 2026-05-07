/**
 * GET /api/analytics/export
 * CSV export of current analytics view. manager+
 * Query param: view=email-metrics|campaigns|reps|batches|funnel
 */
import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

function toCsv(headers: string[], rows: Record<string,unknown>[]): string {
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n')
}

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = createAdminClient()
    const { data: member } = await adminClient
      .from('workspace_members').select('workspace_id, role')
      .eq('user_id', user.id).eq('is_active', true).single() as
      { data: { workspace_id: string; role: string } | null }
    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['manager','admin','super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const view  = searchParams.get('view') ?? 'email-metrics'
    const now   = new Date()
    const start = searchParams.get('start') ?? new Date(new Date(now).setDate(now.getDate() - 30)).toISOString()
    const end   = searchParams.get('end')   ?? new Date().toISOString()

    let csv = ''
    let filename = 'analytics'

    if (view === 'campaigns') {
      const { data: rows } = await adminClient.from('campaigns')
        .select('name, status, total_leads, emails_sent, emails_opened, emails_replied, emails_bounced, started_at')
        .eq('workspace_id', member.workspace_id)
        .gte('created_at', start).lte('created_at', end)
        .order('created_at', { ascending: false }) as { data: Array<Record<string,unknown>> | null }
      const headers = ['name','status','total_leads','emails_sent','emails_opened','emails_replied','emails_bounced','started_at']
      csv = toCsv(headers, rows ?? [])
      filename = 'campaigns'

    } else if (view === 'reps') {
      const [membersRes, emailsRes] = await Promise.all([
        adminClient.from('workspace_members')
          .select('user_id, role, users:user_id(email, raw_user_meta_data)')
          .eq('workspace_id', member.workspace_id).eq('is_active', true),
        adminClient.from('emails').select('sent_by, status')
          .eq('workspace_id', member.workspace_id)
          .gte('sent_at', start).lte('sent_at', end),
      ]) as [
        { data: Array<{ user_id: string; role: string; users: { email: string; raw_user_meta_data: Record<string,unknown> } | null }> | null },
        { data: Array<{ sent_by: string | null; status: string }> | null }
      ]
      const emailMap = new Map<string,{ sent:number;opened:number;replied:number }>()
      for (const e of emailsRes.data ?? []) {
        if (!e.sent_by) continue
        const c = emailMap.get(e.sent_by) ?? {sent:0,opened:0,replied:0}
        c.sent++
        if(['opened','clicked','replied'].includes(e.status)) c.opened++
        if(e.status==='replied') c.replied++
        emailMap.set(e.sent_by, c)
      }
      const r = (n:number,d:number) => d>0?Math.round((n/d)*1000)/10:0
      const data = (membersRes.data ?? []).map(m => {
        const meta = m.users?.raw_user_meta_data as Record<string,unknown>|undefined
        const c = emailMap.get(m.user_id)??{sent:0,opened:0,replied:0}
        return { name:(meta?.full_name??m.users?.email??''), role:m.role, emails_sent:c.sent, open_rate:r(c.opened,c.sent), reply_rate:r(c.replied,c.sent) }
      })
      csv = toCsv(['name','role','emails_sent','open_rate','reply_rate'], data as Record<string,unknown>[])
      filename = 'rep-performance'

    } else {
      // Default: time-series
      const { data: rows } = await adminClient.from('emails')
        .select('sent_at, status').eq('workspace_id', member.workspace_id)
        .gte('sent_at', start).lte('sent_at', end).not('sent_at','is',null) as
        { data: Array<{ sent_at: string; status: string }> | null }
      const dayMap = new Map<string,{sent:number;opened:number;replied:number;bounced:number}>()
      for (const e of rows ?? []) {
        const d = e.sent_at.slice(0,10)
        const c = dayMap.get(d)??{sent:0,opened:0,replied:0,bounced:0}
        c.sent++
        if(['opened','clicked','replied'].includes(e.status)) c.opened++
        if(e.status==='replied') c.replied++
        if(e.status==='bounced') c.bounced++
        dayMap.set(d, c)
      }
      const data = Array.from(dayMap.entries()).sort().map(([date,v])=>({date,...v}))
      csv = toCsv(['date','sent','opened','replied','bounced'], data as Record<string,unknown>[])
      filename = 'email-metrics'
    }

    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv',
        'Content-Disposition': `attachment; filename="${filename}-${start.slice(0,10)}-to-${end.slice(0,10)}.csv"`,
      },
    })
  } catch (err) {
    console.error('[GET /api/analytics/export]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

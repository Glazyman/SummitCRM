import { NextResponse } from 'next/server'
import { GET as getAnalytics } from '../reps/route'
import type { CallOverview, RepRow } from '@/components/analytics/types'

function toCsv(headers: string[], rows: Record<string, unknown>[]) {
  const escape = (value: unknown) => {
    let text = String(value ?? '')
    if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text)) text = `'${text}`
    return /[,"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [headers.join(','), ...rows.map(row => headers.map(key => escape(row[key])).join(','))].join('\r\n')
}

/** Export the same authorized, date-scoped data used by the Analytics page. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const view = params.get('view') ?? 'overview'
  if (!['overview', 'reps'].includes(view)) return NextResponse.json({ error: 'Unknown analytics view' }, { status: 400 })
  const response = await getAnalytics(req)
  if (!response.ok) return response
  const data = await response.json() as { reps: RepRow[]; overview: CallOverview; period: { start: string; end: string } }
  let rows: Record<string, unknown>[]
  let headers: string[]
  if (view === 'reps') {
    headers = ['name', 'role', 'active_days', 'last_call_at', 'leads_called', 'answered', 'answer_rate_percent', 'voicemail', 'no_answer', 'wrong_number', 'callbacks', 'marked_interested', 'follow_ups_completed', 'current_pending', 'current_overdue', 'current_assigned']
    rows = data.reps.map(r => ({ name: r.full_name || r.user_email, role: r.role, active_days: r.active_days ?? 0, last_call_at: r.last_call_at ?? '', leads_called: r.unique_leads,
      answered: r.calls_answered, answer_rate_percent: r.calls ? Math.round(r.calls_answered / r.calls * 100) : '',
      voicemail: r.calls_voicemail, no_answer: r.calls_no_answer, wrong_number: r.calls_wrong_number, callbacks: r.calls_callback ?? 0,
      marked_interested: r.interested_marked ?? 0, follow_ups_completed: r.follow_ups_completed,
      current_pending: r.role === 'historical' ? '' : r.follow_ups_pending, current_overdue: r.role === 'historical' ? '' : r.follow_ups_overdue, current_assigned: r.role === 'historical' ? '' : r.leads_assigned }))
  } else {
    headers = ['metric', 'value', 'scope']
    const periodKeys = ['total', 'unique_leads', 'answered', 'voicemail', 'no_answer', 'wrong_number', 'callback', 'interested_marked', 'follow_ups_completed']
    rows = Object.entries(data.overview).filter(([metric]) => metric !== 'total').map(([metric, value]) => ({ metric: metric === 'unique_leads' ? 'leads_called' : metric, value, scope: periodKeys.includes(metric) ? 'selected period' : 'current snapshot' }))
  }
  return new NextResponse(toCsv(headers, rows), { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="analytics-${view}-${data.period.start.slice(0, 10)}-to-${data.period.end.slice(0, 10)}.csv"`,
  } })
}

import type { EmailMetrics, TimeSeriesPoint, FunnelData, CampaignRow, RepRow, BatchRow } from './types'

// ── Realistic 30-day time series ─────────────────────────────────────────
function genSeries(): TimeSeriesPoint[] {
  const series: TimeSeriesPoint[] = []
  const base = new Date('2026-04-08')
  const peaks = [4, 11, 18, 25] // higher volume on certain days

  for (let i = 0; i < 30; i++) {
    const date = new Date(base)
    date.setDate(base.getDate() + i)
    const dow     = date.getDay()
    const weekend = dow === 0 || dow === 6
    const peak    = peaks.includes(i)
    const sent    = weekend ? 0 : peak ? Math.floor(70 + Math.random() * 30) : Math.floor(40 + Math.random() * 25)
    const opened  = Math.floor(sent * (0.22 + Math.random() * 0.12))
    const clicked = Math.floor(opened * (0.15 + Math.random() * 0.1))
    const replied = Math.floor(sent * (0.04 + Math.random() * 0.04))
    const bounced = Math.floor(sent * (0.005 + Math.random() * 0.01))
    series.push({ date: date.toISOString().slice(0, 10), sent, opened, clicked, replied, bounced })
  }
  return series
}

export const MOCK_TIME_SERIES: TimeSeriesPoint[] = genSeries()

export const MOCK_EMAIL_METRICS: EmailMetrics = {
  period: { start: '2026-04-08T00:00:00Z', end: '2026-05-07T23:59:59Z' },
  totals: {
    sent:        1842,
    opened:       523,
    clicked:       89,
    replied:      114,
    bounced:       20,
    open_rate:    28.4,
    click_rate:    4.8,
    reply_rate:    6.2,
    bounce_rate:   1.1,
  },
}

export const MOCK_FUNNEL: FunnelData = {
  funnel: [
    { status: 'new',        count: 3417, percentage: 100  },
    { status: 'contacted',  count: 1842, percentage: 53.9 },
    { status: 'replied',    count:  284, percentage:  8.3 },
    { status: 'interested', count:   97, percentage:  2.8 },
    { status: 'converted',  count:   31, percentage:  0.9 },
  ],
  breakdown: [
    { status: 'new',            count: 1241 },
    { status: 'contacted',      count:  834 },
    { status: 'replied',        count:  284 },
    { status: 'interested',     count:   97 },
    { status: 'converted',      count:   31 },
    { status: 'do_not_contact', count:   48 },
    { status: 'unsubscribed',   count:   23 },
  ],
  total: 3417,
}

export const MOCK_CAMPAIGNS: CampaignRow[] = [
  { id: 'c1', name: 'SaaS Founders Q2',        status: 'running',   total_leads: 320, emails_sent: 187, open_rate: 32.1, click_rate: 5.9, reply_rate: 7.5, bounce_rate: 0.5, started_at: '2026-04-28T00:00:00Z', completed_at: null,                    created_at: '2026-04-28T00:00:00Z' },
  { id: 'c2', name: 'E-commerce Reactivation', status: 'running',   total_leads: 150, emails_sent:  89, open_rate: 34.8, click_rate: 7.9, reply_rate: 9.0, bounce_rate: 1.1, started_at: '2026-05-01T00:00:00Z', completed_at: null,                    created_at: '2026-05-01T00:00:00Z' },
  { id: 'c3', name: 'Series A Outreach',        status: 'paused',    total_leads: 220, emails_sent:  60, open_rate: 23.3, click_rate: 3.3, reply_rate: 5.0, bounce_rate: 1.7, started_at: '2026-04-20T00:00:00Z', completed_at: null,                    created_at: '2026-04-20T00:00:00Z' },
  { id: 'c4', name: 'Product Hunt Launch',      status: 'completed', total_leads:  80, emails_sent:  80, open_rate: 41.3, click_rate:12.5, reply_rate:11.3, bounce_rate: 0.0, started_at: '2026-04-10T00:00:00Z', completed_at: '2026-04-18T00:00:00Z', created_at: '2026-04-10T00:00:00Z' },
  { id: 'c5', name: 'HR Software Verticals',   status: 'completed', total_leads: 200, emails_sent: 196, open_rate: 19.9, click_rate: 2.6, reply_rate: 3.6, bounce_rate: 2.0, started_at: '2026-04-01T00:00:00Z', completed_at: '2026-04-15T00:00:00Z', created_at: '2026-04-01T00:00:00Z' },
]

export const MOCK_REPS: RepRow[] = [
  { user_id: 'u1', user_email: 'sarah@summits.io',  full_name: 'Sarah Chen',     role: 'rep',     emails_sent: 412, open_rate: 31.8, reply_rate: 7.0, bounce_rate: 0.7, leads_assigned: 624 },
  { user_id: 'u2', user_email: 'james@summits.io',  full_name: 'James O\'Brien', role: 'rep',     emails_sent: 388, open_rate: 27.8, reply_rate: 5.4, bounce_rate: 1.3, leads_assigned: 589 },
  { user_id: 'u3', user_email: 'priya@summits.io',  full_name: 'Priya Mehta',    role: 'manager', emails_sent: 321, open_rate: 30.2, reply_rate: 5.6, bounce_rate: 0.9, leads_assigned: 512 },
  { user_id: 'u4', user_email: 'tom@summits.io',    full_name: 'Tom Adeyemi',    role: 'rep',     emails_sent: 290, open_rate: 24.5, reply_rate: 4.1, bounce_rate: 1.4, leads_assigned: 441 },
  { user_id: 'u5', user_email: 'anna@summits.io',   full_name: 'Anna Kovacs',    role: 'rep',     emails_sent: 220, open_rate: 28.2, reply_rate: 4.5, bounce_rate: 0.9, leads_assigned: 337 },
  { user_id: 'u6', user_email: 'marcus@summits.io', full_name: 'Marcus Huang',   role: 'rep',     emails_sent: 211, open_rate: 23.7, reply_rate: 3.8, bounce_rate: 2.4, leads_assigned: 310 },
]

export const MOCK_BATCHES: BatchRow[] = [
  { id: 'b1', name: 'Apollo Export — May 2026',  lead_count: 850, emails_sent: 612, open_rate: 29.4, reply_rate: 6.7, conversion_rate: 1.2, created_at: '2026-05-01T00:00:00Z' },
  { id: 'b2', name: 'LinkedIn Scrape Q2',         lead_count: 620, emails_sent: 480, open_rate: 31.0, reply_rate: 7.9, conversion_rate: 1.6, created_at: '2026-04-15T00:00:00Z' },
  { id: 'b3', name: 'Conference Leads — SaaStr',  lead_count: 140, emails_sent: 140, open_rate: 44.3, reply_rate:12.1, conversion_rate: 3.6, created_at: '2026-04-08T00:00:00Z' },
  { id: 'b4', name: 'Cold DB — HR Verticals',     lead_count: 400, emails_sent: 310, open_rate: 18.7, reply_rate: 3.5, conversion_rate: 0.5, created_at: '2026-04-01T00:00:00Z' },
  { id: 'b5', name: 'Inbound Website Signups',    lead_count:  88, emails_sent:  62, open_rate: 51.6, reply_rate:18.5, conversion_rate: 5.7, created_at: '2026-03-20T00:00:00Z' },
]

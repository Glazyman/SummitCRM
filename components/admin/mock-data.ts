/**
 * Mock data for admin dashboard — replace with real API calls on backend ready.
 */
import type {
  OverviewData, RepStat, SendingAccountHealth,
  CampaignSummary, AiUsageSummary, ActivityEvent,
} from './types'

export const MOCK_OVERVIEW: OverviewData = {
  date_range:       { start: '2026-04-08T00:00:00Z', end: '2026-05-07T23:59:59Z' },
  totals: {
    emails_sent:      1842,
    open_rate:        28.4,
    reply_rate:       6.2,
    bounce_rate:      1.1,
    active_leads:     3417,
    new_leads_period: 284,
  },
  quota_warnings:   [],
  active_campaigns: 3,
  ai_tokens_month:  148320,
  ai_cost_usd:      0.14,
}

export const MOCK_TEAM_STATS: RepStat[] = [
  { user_id: 'u1', user_email: 'sarah@summits.io',   full_name: 'Sarah Chen',    role: 'rep',     emails_sent: 412, emails_opened: 131, emails_replied: 29, open_rate: 31.8, reply_rate: 7.0,  last_active: '2026-05-07T14:22:00Z' },
  { user_id: 'u2', user_email: 'james@summits.io',   full_name: 'James O\'Brien', role: 'rep',    emails_sent: 388, emails_opened: 108, emails_replied: 21, open_rate: 27.8, reply_rate: 5.4,  last_active: '2026-05-07T09:11:00Z' },
  { user_id: 'u3', user_email: 'priya@summits.io',   full_name: 'Priya Mehta',   role: 'manager', emails_sent: 321, emails_opened: 97,  emails_replied: 18, open_rate: 30.2, reply_rate: 5.6,  last_active: '2026-05-06T17:44:00Z' },
  { user_id: 'u4', user_email: 'tom@summits.io',     full_name: 'Tom Adeyemi',   role: 'rep',     emails_sent: 290, emails_opened: 71,  emails_replied: 12, open_rate: 24.5, reply_rate: 4.1,  last_active: '2026-05-05T11:30:00Z' },
  { user_id: 'u5', user_email: 'anna@summits.io',    full_name: 'Anna Kovacs',   role: 'rep',     emails_sent: 220, emails_opened: 62,  emails_replied: 10, open_rate: 28.2, reply_rate: 4.5,  last_active: '2026-05-07T16:00:00Z' },
  { user_id: 'u6', user_email: 'marcus@summits.io',  full_name: 'Marcus Huang',  role: 'rep',     emails_sent: 211, emails_opened: 50,  emails_replied: 8,  open_rate: 23.7, reply_rate: 3.8,  last_active: '2026-05-04T08:20:00Z' },
]

export const MOCK_ACCOUNT_HEALTH: SendingAccountHealth[] = [
  { id: 'a1', name: 'Primary outreach',     from_email: 'outreach@summits.io',   type: 'resend', emails_sent_today: 44, daily_limit: 50, quota_pct: 88, bounces_7d: 2, failures_7d: 0, is_active: true },
  { id: 'a2', name: 'Backup SMTP',          from_email: 'hello@summits.io',      type: 'smtp',   emails_sent_today: 27, daily_limit: 50, quota_pct: 54, bounces_7d: 0, failures_7d: 1, is_active: true },
  { id: 'a3', name: 'Campaign blast',       from_email: 'campaigns@summits.io',  type: 'resend', emails_sent_today: 12, daily_limit: 50, quota_pct: 24, bounces_7d: 5, failures_7d: 2, is_active: true },
  { id: 'a4', name: 'Personal – Sarah',     from_email: 'sarah@summits.io',      type: 'smtp',   emails_sent_today: 6,  daily_limit: 50, quota_pct: 12, bounces_7d: 0, failures_7d: 0, is_active: true },
]

export const MOCK_CAMPAIGNS: CampaignSummary[] = [
  { id: 'c1', name: 'SaaS Founders Q2',      status: 'running',   total_leads: 320, emails_sent: 187, emails_opened: 54,  open_rate: 28.9, created_at: '2026-04-28T00:00:00Z' },
  { id: 'c2', name: 'E-commerce Reactivation', status: 'running', total_leads: 150, emails_sent: 89,  emails_opened: 31,  open_rate: 34.8, created_at: '2026-05-01T00:00:00Z' },
  { id: 'c3', name: 'Series A Outreach',      status: 'paused',   total_leads: 220, emails_sent: 60,  emails_opened: 14,  open_rate: 23.3, created_at: '2026-04-20T00:00:00Z' },
]

export const MOCK_AI_USAGE: AiUsageSummary = {
  total_tokens:    148320,
  total_cost_usd:  0.14,
  total_calls:     312,
  budget:          1_000_000,
  budget_used_pct: 15,
}

export const MOCK_ACTIVITY: ActivityEvent[] = [
  { id: 'ev1',  type: 'email_sent',        user_id: 'u1', user_name: 'Sarah Chen',    user_email: 'sarah@summits.io',  metadata: { subject: 'Quick question about your roadmap' },       created_at: '2026-05-07T16:41:00Z' },
  { id: 'ev2',  type: 'email_replied',     user_id: 'u2', user_name: 'James O\'Brien', user_email: 'james@summits.io', metadata: { subject: 'Following up' },                             created_at: '2026-05-07T15:58:00Z' },
  { id: 'ev3',  type: 'lead_created',      user_id: 'u3', user_name: 'Priya Mehta',   user_email: 'priya@summits.io',  metadata: { count: 45, source: 'CSV import' },                    created_at: '2026-05-07T14:30:00Z' },
  { id: 'ev4',  type: 'campaign_started',  user_id: 'u3', user_name: 'Priya Mehta',   user_email: 'priya@summits.io',  metadata: { campaign_name: 'E-commerce Reactivation' },           created_at: '2026-05-07T13:02:00Z' },
  { id: 'ev5',  type: 'email_sent',        user_id: 'u4', user_name: 'Tom Adeyemi',   user_email: 'tom@summits.io',    metadata: { subject: 'Intro — Summits CRM' },                     created_at: '2026-05-07T12:55:00Z' },
  { id: 'ev6',  type: 'follow_up_created', user_id: 'u1', user_name: 'Sarah Chen',    user_email: 'sarah@summits.io',  metadata: { due_at: '2026-05-10T10:00:00Z' },                     created_at: '2026-05-07T12:20:00Z' },
  { id: 'ev7',  type: 'email_bounced',     user_id: 'u5', user_name: 'Anna Kovacs',   user_email: 'anna@summits.io',   metadata: { reason: 'No mailbox found' },                         created_at: '2026-05-07T11:44:00Z' },
  { id: 'ev8',  type: 'note_added',        user_id: 'u2', user_name: 'James O\'Brien', user_email: 'james@summits.io', metadata: {},                                                     created_at: '2026-05-07T10:33:00Z' },
  { id: 'ev9',  type: 'lead_status_changed', user_id: 'u1', user_name: 'Sarah Chen', user_email: 'sarah@summits.io',  metadata: { from: 'new', to: 'interested' },                      created_at: '2026-05-07T09:58:00Z' },
  { id: 'ev10', type: 'campaign_paused',   user_id: 'u3', user_name: 'Priya Mehta',   user_email: 'priya@summits.io',  metadata: { campaign_name: 'Series A Outreach' },                created_at: '2026-05-06T17:10:00Z' },
  { id: 'ev11', type: 'email_sent',        user_id: 'u6', user_name: 'Marcus Huang',  user_email: 'marcus@summits.io', metadata: { subject: 'One more thought on your growth strategy' }, created_at: '2026-05-06T16:04:00Z' },
  { id: 'ev12', type: 'email_opened',      user_id: 'u4', user_name: 'Tom Adeyemi',   user_email: 'tom@summits.io',    metadata: { subject: 'Intro — Summits CRM' },                     created_at: '2026-05-06T14:22:00Z' },
]

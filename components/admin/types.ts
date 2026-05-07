/**
 * Admin dashboard shared types.
 * Mirror of API response shapes — keeps components independent of fetch logic.
 */

export type DateRangePreset = 'today' | '7d' | '30d' | 'month' | 'custom'

export interface DateRange {
  start: string   // ISO 8601
  end:   string
}

// ── /api/admin/overview ───────────────────────────────────────────────────
export interface OverviewTotals {
  emails_sent:      number
  open_rate:        number   // percentage 0–100
  reply_rate:       number
  bounce_rate:      number
  active_leads:     number
  new_leads_period: number
}

export interface OverviewData {
  date_range:         DateRange
  totals:             OverviewTotals
  quota_warnings:     SendingAccountHealth[]   // accounts > 80% quota
  active_campaigns:   number
  ai_tokens_month:    number
  ai_cost_usd:        number
}

// ── /api/admin/team-stats ─────────────────────────────────────────────────
export interface RepStat {
  user_id:       string
  user_email:    string
  full_name:     string | null
  role:          string
  emails_sent:   number
  emails_opened: number
  emails_replied:number
  open_rate:     number   // %
  reply_rate:    number   // %
  last_active:   string | null
}

// ── /api/admin/account-health ─────────────────────────────────────────────
export interface SendingAccountHealth {
  id:             string
  name:           string
  from_email:     string
  type:           'resend' | 'smtp'
  emails_sent_today: number
  daily_limit:    number
  quota_pct:      number
  bounces_7d:     number
  failures_7d:    number
  is_active:      boolean
}

// ── /api/admin/campaigns-summary ──────────────────────────────────────────
export interface CampaignSummary {
  id:           string
  name:         string
  status:       string
  total_leads:  number
  emails_sent:  number
  emails_opened:number
  open_rate:    number
  created_at:   string
}

// ── /api/admin/ai-usage ───────────────────────────────────────────────────
export interface AiUsageSummary {
  total_tokens:    number
  total_cost_usd:  number
  total_calls:     number
  budget:          number
  budget_used_pct: number
}

// ── /api/admin/activity ───────────────────────────────────────────────────
export interface ActivityEvent {
  id:         string
  type:       string
  user_id:    string
  user_name:  string | null
  user_email: string
  metadata:   Record<string, unknown>
  created_at: string
}

export interface EmailMetrics {
  period:  { start: string; end: string }
  totals: {
    sent:       number
    opened:     number
    clicked:    number
    replied:    number
    bounced:    number
    open_rate:  number
    click_rate: number
    reply_rate: number
    bounce_rate:number
  }
}

export interface TimeSeriesPoint {
  date:    string
  sent:    number
  opened:  number
  clicked: number
  replied: number
  bounced: number
}

export interface FunnelStage {
  status:     string
  count:      number
  percentage: number
}

export interface FunnelData {
  funnel:    FunnelStage[]
  breakdown: Array<{ status: string; count: number }>
  total:     number
}

export interface CampaignRow {
  id:           string
  name:         string
  status:       string
  total_leads:  number
  emails_sent:  number
  open_rate:    number
  click_rate:   number
  reply_rate:   number
  bounce_rate:  number
  started_at:   string | null
  completed_at: string | null
  created_at:   string
}

export interface RepRow {
  user_id:             string
  user_email:          string
  full_name:           string | null
  role:                string
  calls:               number
  /** Distinct leads this rep called in the period (one per lead). */
  unique_leads:        number
  calls_answered:      number
  calls_voicemail:     number
  calls_no_answer:     number
  calls_wrong_number:  number
  follow_ups_pending:  number
  follow_ups_overdue:  number
  follow_ups_completed:number
  leads_assigned:      number
  leads_active:        number
  leads_new:           number
}

export interface BatchRow {
  id:         string
  name:       string
  lead_count: number
  created_at: string
}

export interface CallOverview {
  total:            number
  /** Distinct leads called in the period — one per lead (excludes repeat calls). */
  unique_leads:     number
  /** Current workspace lead-status snapshot (not date-filtered). */
  interested:       number
  not_interested:   number
  bad_leads:        number
  answered:         number
  voicemail:        number
  no_answer:        number
  wrong_number:     number
  callback:         number
  follow_ups_due:   number
  follow_ups_overdue: number
  leads_total:      number
  leads_active:     number
}

export type AnalyticsTab = 'overview' | 'reps' | 'funnel' | 'batches'

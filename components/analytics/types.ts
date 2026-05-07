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
  user_id:        string
  user_email:     string
  full_name:      string | null
  role:           string
  emails_sent:    number
  open_rate:      number
  reply_rate:     number
  bounce_rate:    number
  leads_assigned: number
}

export interface BatchRow {
  id:              string
  name:            string
  lead_count:      number
  emails_sent:     number
  open_rate:       number
  reply_rate:      number
  conversion_rate: number
  created_at:      string
}

export type AnalyticsTab = 'overview' | 'campaigns' | 'funnel' | 'reps' | 'batches'

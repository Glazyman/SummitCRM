export interface RepRow {
  active_days?: number
  last_call_at?: string | null
  user_id:             string
  user_email:          string
  full_name:           string | null
  role:                string
  /** First calls per rep/lead; same count as unique_leads. */
  calls:               number
  /** Distinct leads this rep called in the period (one per lead). */
  unique_leads:        number
  calls_answered:      number
  calls_voicemail:     number
  calls_no_answer:     number
  calls_callback?:     number
  calls_wrong_number:  number
  follow_ups_pending:  number
  follow_ups_overdue:  number
  follow_ups_completed:number
  leads_assigned:      number
  leads_active:        number
  leads_new:           number
  /** Interested leads currently assigned to this rep, independent of dates. */
  interested_current?: number
  /** Leads this rep marked interested within the period. */
  interested_marked?:  number
}

export interface BatchRow {
  id:         string
  name:       string
  lead_count: number
  created_at: string
}

export interface CallOverview {
  interested_marked?: number
  follow_ups_completed?: number
  /** Leads first called in the period. */
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
  /** Leads contacted ever (last_contacted_at set) — denominator for lead-status %. */
  contacted_total:  number
}

export type AnalyticsTab = 'overview' | 'reps' | 'funnel' | 'batches'

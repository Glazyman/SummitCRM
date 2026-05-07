export type {
  Campaign, CampaignStep, CampaignWithSteps, CampaignStatus,
  CampaignAnalytics, CampaignEmailRow, CreateCampaignPayload,
  CreateStepPayload, AiTone,
} from '@/lib/campaigns/types'

// ── Frontend-only types ───────────────────────────────────────────────────

/** Lightweight step state used in the builder wizard */
export interface BuilderStep {
  id:               string   // local UUID for React key
  step_number:      number
  subject_template: string
  body_template:    string
  delay_days:       number
  use_ai:           boolean
  ai_tone:          'professional' | 'casual' | 'direct' | 'friendly'
}

/** Batch option for the batch picker */
export interface BatchOption {
  id:         string
  name:       string
  lead_count: number
}

/** Sending account option for the account picker */
export interface AccountOption {
  id:           string
  name:         string
  from_email:   string
  from_name:    string
  quota_remaining: number
  quota_percent:   number
}

/** Wizard step IDs */
export type WizardStep = 'basics' | 'sequence' | 'preview' | 'confirm'

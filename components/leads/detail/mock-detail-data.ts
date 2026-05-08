/**
 * Realistic mock data for a single lead detail page.
 * Replace with real Supabase queries when backend is connected.
 */
import type {
  LeadDetail, ActivityEntry, EmailHistoryItem, FollowUp, TeamMember,
} from './types'

const now = Date.now()
const ago = (h: number) => new Date(now - h * 3600000).toISOString()

// ── Lead ─────────────────────────────────────────────────────────────────
export const MOCK_LEAD: LeadDetail = {
  id:              'l01',
  workspace_id:    'ws1',
  interest_status: 'pending',
  first_name:      'James',
  last_name:       'Harrington',
  email:           'james.h@vertexsoftware.io',
  phone:           '+1 415 555 0101',
  title:           'CEO',
  company:         'Vertex Software',
  website:         'https://vertexsoftware.io',
  linkedin_url:    'https://linkedin.com/in/jharrington',
  status:          'interested',
  is_unsubscribed: false,
  batch_id:        'b1',
  batch_name:      'Q2 SaaS Founders',
  assigned_to:     'u1',
  assigned_name:   'Alice Chen',
  assigned_avatar: null,
  source:          'csv_import',
  ai_summary:      'James is actively evaluating outreach tools for a 30-person sales team. Key pain points: manual follow-ups and email tracking. Decision timeline: Q3 2026.',
  custom_fields: {
    linkedin_followers: '2,400',
    company_size:       '30–50',
    funding_stage:      'Series A',
    tech_stack:         'HubSpot, Salesforce',
  },
  created_at:  ago(14 * 24),
  updated_at:  ago(2),
}

// ── Team ─────────────────────────────────────────────────────────────────
export const MOCK_TEAM: TeamMember[] = [
  { id: 'u1', name: 'Alice Chen'   },
  { id: 'u2', name: 'Bob Tanaka'   },
  { id: 'u3', name: "Cara O'Brien" },
]

// ── Activity ──────────────────────────────────────────────────────────────
export const MOCK_ACTIVITY: ActivityEntry[] = [
  {
    id: 'a1', source: 'note', type: 'note_added',
    user_id: 'u1', user_name: 'Alice Chen', user_initials: 'AC',
    created_at: ago(2),
    metadata: {},
    note_id: 'n1',
    note_content: 'Great discovery call — James confirmed they\'re evaluating 3 solutions. He\'s the decision maker. Asked for a demo next week. Priority: HIGH.',
    note_editable: true,
  },
  {
    id: 'a2', source: 'activity', type: 'email_replied',
    user_id: null, user_name: null, user_initials: null,
    created_at: ago(5),
    metadata: { subject: 'Re: Quick question about your outreach process', email_id: 'e2' },
  },
  {
    id: 'a3', source: 'activity', type: 'email_opened',
    user_id: null, user_name: null, user_initials: null,
    created_at: ago(6),
    metadata: { subject: 'Quick question about your outreach process', email_id: 'e1' },
  },
  {
    id: 'a4', source: 'activity', type: 'email_sent',
    user_id: 'u1', user_name: 'Alice Chen', user_initials: 'AC',
    created_at: ago(24),
    metadata: { subject: 'Quick question about your outreach process', email_id: 'e1' },
  },
  {
    id: 'a5', source: 'note', type: 'note_added',
    user_id: 'u2', user_name: 'Bob Tanaka', user_initials: 'BT',
    created_at: ago(48),
    metadata: {},
    note_id: 'n2',
    note_content: 'LinkedIn connection accepted. Will follow up via email.',
    note_editable: false,
  },
  {
    id: 'a6', source: 'activity', type: 'lead_status_changed',
    user_id: 'u1', user_name: 'Alice Chen', user_initials: 'AC',
    created_at: ago(72),
    metadata: { from: 'contacted', to: 'interested' },
  },
  {
    id: 'a7', source: 'activity', type: 'follow_up_scheduled',
    user_id: 'u1', user_name: 'Alice Chen', user_initials: 'AC',
    created_at: ago(96),
    metadata: { title: 'Send product overview deck', due_at: new Date(now + 48 * 3600000).toISOString() },
  },
  {
    id: 'a8', source: 'activity', type: 'email_sent',
    user_id: 'u1', user_name: 'Alice Chen', user_initials: 'AC',
    created_at: ago(120),
    metadata: { subject: 'Intro: Summits CRM for outreach teams', email_id: 'e0' },
  },
  {
    id: 'a9', source: 'activity', type: 'lead_imported',
    user_id: 'u1', user_name: 'Alice Chen', user_initials: 'AC',
    created_at: ago(14 * 24),
    metadata: { batch_name: 'Q2 SaaS Founders', file_name: 'q2-saas-leads.csv' },
  },
]

// ── Email history ─────────────────────────────────────────────────────────
export const MOCK_EMAILS: EmailHistoryItem[] = [
  {
    id:          'e2',
    subject:     'Re: Quick question about your outreach process',
    body_html:   '<p>Hi Alice,</p><p>Thanks for reaching out — your timing is perfect. We\'ve been looking into solutions exactly like this. Would love to set up a 30-min call to learn more.</p><p>Best,<br>James</p>',
    sent_by:     null,
    sender_name: 'James Harrington (replied)',
    status:      'replied',
    sent_at:     ago(5),
    opened_at:   ago(5),
    clicked_at:  null,
    replied_at:  ago(5),
  },
  {
    id:          'e1',
    subject:     'Quick question about your outreach process',
    body_html:   '<p>Hi James,</p><p>I noticed Vertex Software has been scaling its sales team significantly — congrats on the growth!</p><p>We help teams like yours automate personalized outreach at scale. Would you be open to a quick 15-min chat this week?</p><p>Best,<br>Alice</p>',
    sent_by:     'u1',
    sender_name: 'Alice Chen',
    status:      'replied',
    sent_at:     ago(24),
    opened_at:   ago(6),
    clicked_at:  null,
    replied_at:  ago(5),
  },
  {
    id:          'e0',
    subject:     'Intro: Summits CRM for outreach teams',
    body_html:   '<p>Hi James,</p><p>I came across Vertex Software and wanted to share how Summits CRM has helped similar SaaS founders 3x their reply rates.</p><p>Happy to share a case study if you\'re interested.</p><p>Alice</p>',
    sent_by:     'u1',
    sender_name: 'Alice Chen',
    status:      'opened',
    sent_at:     ago(120),
    opened_at:   ago(119),
    clicked_at:  null,
    replied_at:  null,
  },
]

// ── Follow-ups ────────────────────────────────────────────────────────────
export const MOCK_FOLLOW_UPS: FollowUp[] = [
  {
    id:            'f1',
    title:         'Send product overview deck',
    notes:         'Include pricing page and case study PDF',
    due_at:        new Date(now + 2 * 24 * 3600000).toISOString(),
    is_completed:  false,
    completed_at:  null,
    assigned_to:   'u1',
    assigned_name: 'Alice Chen',
  },
  {
    id:            'f2',
    title:         'Schedule demo call',
    notes:         null,
    due_at:        new Date(now + 7 * 24 * 3600000).toISOString(),
    is_completed:  false,
    completed_at:  null,
    assigned_to:   'u1',
    assigned_name: 'Alice Chen',
  },
  {
    id:            'f3',
    title:         'Initial LinkedIn connection',
    notes:         null,
    due_at:        ago(48),
    is_completed:  true,
    completed_at:  ago(48),
    assigned_to:   'u2',
    assigned_name: 'Bob Tanaka',
  },
]

/**
 * components/leads/status-config.ts
 *
 * Centralised metadata for every lead status value.
 * Soft pastel badge palette matching the site's rounded style.
 */
import type { LeadStatus, InterestStatus } from '@/types/database'

export interface StatusMeta {
  label:     string
  /** Tailwind bg+text classes for the badge */
  badge:     string
  /** Tailwind bg+text for the status bar pill */
  pill:      string
  /** Dot color for filter chips */
  dot:       string
  /** Used for sort ordering in the status column */
  rank:      number
}

export const STATUS_CONFIG: Record<LeadStatus, StatusMeta> = {
  new: {
    label: 'New',
    badge: 'bg-blue-50 text-blue-600 border-blue-200',
    pill:  'bg-blue-50 text-blue-600',
    dot:   'bg-blue-400',
    rank:  0,
  },
  called: {
    label: 'Called',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pill:  'bg-emerald-50 text-emerald-700',
    dot:   'bg-emerald-400',
    rank:  1,
  },
  emailed: {
    label: 'Emailed',
    badge: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    pill:  'bg-indigo-50 text-indigo-600',
    dot:   'bg-indigo-400',
    rank:  2,
  },
  voicemail: {
    label: 'Voicemail',
    badge: 'bg-purple-50 text-purple-600 border-purple-200',
    pill:  'bg-purple-50 text-purple-600',
    dot:   'bg-purple-400',
    rank:  3,
  },
  no_answer: {
    label: 'No Answer',
    badge: 'bg-orange-50 text-orange-600 border-orange-200',
    pill:  'bg-orange-50 text-orange-600',
    dot:   'bg-orange-400',
    rank:  4,
  },
  wrong_number: {
    label: 'Wrong Number',
    badge: 'bg-red-50 text-red-600 border-red-200',
    pill:  'bg-red-50 text-red-600',
    dot:   'bg-red-400',
    rank:  5,
  },
  sold_already: {
    label: 'Sold Already',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    pill:  'bg-amber-50 text-amber-700',
    dot:   'bg-amber-400',
    rank:  6,
  },
  contacted: {
    label: 'Contacted',
    badge: 'bg-violet-50 text-violet-600 border-violet-200',
    pill:  'bg-violet-50 text-violet-600',
    dot:   'bg-violet-400',
    rank:  7,
  },
  replied: {
    label: 'Replied',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    pill:  'bg-amber-50 text-amber-700',
    dot:   'bg-amber-400',
    rank:  8,
  },
  interested: {
    label: 'Interested',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pill:  'bg-emerald-50 text-emerald-700',
    dot:   'bg-emerald-400',
    rank:  9,
  },
  not_interested: {
    label: 'Not Interested',
    badge: 'bg-slate-100 text-slate-500 border-slate-200',
    pill:  'bg-slate-100 text-slate-500',
    dot:   'bg-slate-400',
    rank:  10,
  },
  do_not_contact: {
    label: 'Bad Lead',
    badge: 'bg-red-50 text-red-700 border-red-200',
    pill:  'bg-red-50 text-red-700',
    dot:   'bg-red-600',
    rank:  11,
  },
  unsubscribed: {
    label: 'Unsubscribed',
    badge: 'bg-orange-50 text-orange-600 border-orange-200',
    pill:  'bg-orange-50 text-orange-600',
    dot:   'bg-orange-400',
    rank:  12,
  },
  converted: {
    label: 'Converted',
    badge: 'bg-teal-50 text-teal-700 border-teal-200',
    pill:  'bg-teal-50 text-teal-700',
    dot:   'bg-teal-400',
    rank:  13,
  },
}

/** Ordered list of all statuses — used in dropdowns / filter lists */
export const ALL_STATUSES: LeadStatus[] = [
  'new', 'called', 'voicemail', 'no_answer', 'wrong_number', 'sold_already',
  'do_not_contact',
]

// ── Interest status config ─────────────────────────────────────────────────

export interface InterestMeta {
  label: string
  badge: string
  dot:   string
}

export const INTEREST_CONFIG: Record<InterestStatus, InterestMeta> = {
  pending: {
    label: 'Pending',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot:   'bg-amber-400',
  },
  interested: {
    label: 'Interested',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot:   'bg-emerald-400',
  },
  not_interested: {
    label: 'Not Interested',
    badge: 'bg-red-50 text-red-600 border-red-200',
    dot:   'bg-red-400',
  },
}

export const ALL_INTEREST_STATUSES: InterestStatus[] = [
  'pending', 'interested', 'not_interested',
]

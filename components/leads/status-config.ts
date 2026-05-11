/**
 * components/leads/status-config.ts
 *
 * Centralised metadata for every lead status value.
 * Used across the table badge, filters, status bar, and dropdowns.
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
    badge: 'bg-blue-500 text-white border-blue-600',
    pill:  'bg-blue-100 text-blue-800',
    dot:   'bg-blue-500',
    rank:  0,
  },
  called: {
    label: 'Called',
    badge: 'bg-emerald-500 text-white border-emerald-600',
    pill:  'bg-emerald-100 text-emerald-800',
    dot:   'bg-emerald-500',
    rank:  1,
  },
  emailed: {
    label: 'Emailed',
    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    pill:  'bg-indigo-100 text-indigo-800',
    dot:   'bg-indigo-500',
    rank:  2,
  },
  voicemail: {
    label: 'Voicemail',
    badge: 'bg-purple-500 text-white border-purple-600',
    pill:  'bg-purple-100 text-purple-800',
    dot:   'bg-purple-500',
    rank:  3,
  },
  no_answer: {
    label: 'No Answer',
    badge: 'bg-orange-500 text-white border-orange-600',
    pill:  'bg-orange-100 text-orange-800',
    dot:   'bg-orange-500',
    rank:  4,
  },
  wrong_number: {
    label: 'Wrong Number',
    badge: 'bg-red-500 text-white border-red-600',
    pill:  'bg-red-100 text-red-800',
    dot:   'bg-red-500',
    rank:  5,
  },
  sold_already: {
    label: 'Sold Already',
    badge: 'bg-amber-500 text-white border-amber-600',
    pill:  'bg-amber-100 text-amber-800',
    dot:   'bg-amber-500',
    rank:  6,
  },
  contacted: {
    label: 'Contacted',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
    pill:  'bg-violet-100 text-violet-800',
    dot:   'bg-violet-500',
    rank:  7,
  },
  replied: {
    label: 'Replied',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    pill:  'bg-amber-100 text-amber-800',
    dot:   'bg-amber-500',
    rank:  8,
  },
  interested: {
    label: 'Interested',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    pill:  'bg-emerald-100 text-emerald-800',
    dot:   'bg-emerald-500',
    rank:  9,
  },
  not_interested: {
    label: 'Not Interested',
    badge: 'bg-gray-100 text-gray-600 border-gray-200',
    pill:  'bg-gray-100 text-gray-700',
    dot:   'bg-gray-400',
    rank:  10,
  },
  do_not_contact: {
    label: 'Bad Lead',
    badge: 'bg-gray-800 text-white border-gray-900',
    pill:  'bg-gray-100 text-gray-800',
    dot:   'bg-gray-700',
    rank:  11,
  },
  unsubscribed: {
    label: 'Unsubscribed',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    pill:  'bg-orange-100 text-orange-800',
    dot:   'bg-orange-500',
    rank:  12,
  },
  converted: {
    label: 'Converted',
    badge: 'bg-teal-100 text-teal-700 border-teal-200',
    pill:  'bg-teal-100 text-teal-800',
    dot:   'bg-teal-500',
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
    badge: 'bg-amber-500 text-white border-amber-600',
    dot:   'bg-amber-500',
  },
  interested: {
    label: 'Interested',
    badge: 'bg-emerald-500 text-white border-emerald-600',
    dot:   'bg-emerald-500',
  },
  not_interested: {
    label: 'Not Interested',
    badge: 'bg-red-500 text-white border-red-600',
    dot:   'bg-red-500',
  },
}

export const ALL_INTEREST_STATUSES: InterestStatus[] = [
  'pending', 'interested', 'not_interested',
]

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
  /** Emoji icon (renders without CSS dependency) */
  icon:      string
  /** Used for sort ordering in the status column */
  rank:      number
}

export const STATUS_CONFIG: Record<LeadStatus, StatusMeta> = {
  new: {
    label: 'New',
    badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    pill:  'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60',
    dot:   'bg-blue-500',
    icon:  '🆕',
    rank:  0,
  },
  called: {
    label: 'Called',
    badge: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800',
    pill:  'bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:hover:bg-sky-900/60',
    dot:   'bg-sky-500',
    icon:  '📞',
    rank:  1,
  },
  emailed: {
    label: 'Emailed',
    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800',
    pill:  'bg-indigo-100 text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60',
    dot:   'bg-indigo-500',
    icon:  '✉️',
    rank:  2,
  },
  voicemail: {
    label: 'Voicemail',
    badge: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
    pill:  'bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:hover:bg-purple-900/60',
    dot:   'bg-purple-500',
    icon:  '📬',
    rank:  3,
  },
  no_answer: {
    label: 'No Answer',
    badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    pill:  'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
    dot:   'bg-slate-400',
    icon:  '🔇',
    rank:  4,
  },
  wrong_number: {
    label: 'Wrong Number',
    badge: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
    pill:  'bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60',
    dot:   'bg-rose-500',
    icon:  '❌',
    rank:  5,
  },
  sold_already: {
    label: 'Sold Already',
    badge: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
    pill:  'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:hover:bg-yellow-900/60',
    dot:   'bg-yellow-500',
    icon:  '🏷️',
    rank:  6,
  },
  contacted: {
    label: 'Contacted',
    badge: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800',
    pill:  'bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60',
    dot:   'bg-violet-500',
    icon:  '📨',
    rank:  7,
  },
  replied: {
    label: 'Replied',
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    pill:  'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60',
    dot:   'bg-amber-500',
    icon:  '💬',
    rank:  8,
  },
  interested: {
    label: 'Interested',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    pill:  'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60',
    dot:   'bg-emerald-500',
    icon:  '🔥',
    rank:  9,
  },
  not_interested: {
    label: 'Not Interested',
    badge: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
    pill:  'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
    dot:   'bg-gray-400',
    icon:  '👎',
    rank:  10,
  },
  do_not_contact: {
    label: 'Do Not Contact',
    badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    pill:  'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60',
    dot:   'bg-red-500',
    icon:  '🚫',
    rank:  11,
  },
  unsubscribed: {
    label: 'Unsubscribed',
    badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
    pill:  'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-900/60',
    dot:   'bg-orange-500',
    icon:  '📪',
    rank:  12,
  },
  converted: {
    label: 'Converted',
    badge: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800',
    pill:  'bg-teal-100 text-teal-800 hover:bg-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:hover:bg-teal-900/60',
    dot:   'bg-teal-500',
    icon:  '✅',
    rank:  13,
  },
}

/** Ordered list of all statuses — used in dropdowns / filter lists */
export const ALL_STATUSES: LeadStatus[] = [
  'new', 'called', 'emailed', 'voicemail', 'no_answer', 'wrong_number', 'sold_already',
  'do_not_contact',
]

// ── Interest status config ─────────────────────────────────────────────────

export interface InterestMeta {
  label: string
  badge: string
  dot:   string
  icon:  string
}

export const INTEREST_CONFIG: Record<InterestStatus, InterestMeta> = {
  pending: {
    label: 'Pending',
    badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    dot:   'bg-slate-400',
    icon:  '⏳',
  },
  interested: {
    label: 'Interested',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    dot:   'bg-emerald-500',
    icon:  '✅',
  },
  not_interested: {
    label: 'Not Interested',
    badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    dot:   'bg-red-500',
    icon:  '❌',
  },
}

export const ALL_INTEREST_STATUSES: InterestStatus[] = [
  'pending', 'interested', 'not_interested',
]

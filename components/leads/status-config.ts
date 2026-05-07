/**
 * components/leads/status-config.ts
 *
 * Centralised metadata for every lead status value.
 * Used across the table badge, filters, status bar, and dropdowns.
 */
import type { LeadStatus } from '@/types/database'

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
  contacted: {
    label: 'Contacted',
    badge: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800',
    pill:  'bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60',
    dot:   'bg-violet-500',
    icon:  '📨',
    rank:  1,
  },
  replied: {
    label: 'Replied',
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    pill:  'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60',
    dot:   'bg-amber-500',
    icon:  '💬',
    rank:  2,
  },
  interested: {
    label: 'Interested',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    pill:  'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60',
    dot:   'bg-emerald-500',
    icon:  '🔥',
    rank:  3,
  },
  not_interested: {
    label: 'Not Interested',
    badge: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
    pill:  'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
    dot:   'bg-gray-400',
    icon:  '👎',
    rank:  4,
  },
  do_not_contact: {
    label: 'Do Not Contact',
    badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    pill:  'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60',
    dot:   'bg-red-500',
    icon:  '🚫',
    rank:  5,
  },
  unsubscribed: {
    label: 'Unsubscribed',
    badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
    pill:  'bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:hover:bg-orange-900/60',
    dot:   'bg-orange-500',
    icon:  '📪',
    rank:  6,
  },
  converted: {
    label: 'Converted',
    badge: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800',
    pill:  'bg-teal-100 text-teal-800 hover:bg-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:hover:bg-teal-900/60',
    dot:   'bg-teal-500',
    icon:  '✅',
    rank:  7,
  },
}

/** Ordered list of all statuses — used in dropdowns / filter lists */
export const ALL_STATUSES: LeadStatus[] = [
  'new', 'contacted', 'replied', 'interested',
  'not_interested', 'do_not_contact', 'unsubscribed', 'converted',
]

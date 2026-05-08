/**
 * lib/email/merge.ts
 *
 * Merge variable processing for email subject lines and body HTML.
 *
 * Supported variables (double-brace syntax):
 *   {{first_name}}    {{last_name}}    {{full_name}}
 *   {{company}}       {{title}}        {{email}}
 *   {{sender_name}}   {{sender_email}}
 *
 * Unknown variables are replaced with an empty string (safe fallback).
 */

import type { MergeVariableContext } from './types'

const MERGE_PATTERN = /\{\{(\w+)\}\}/g

/**
 * Replace all {{variable}} placeholders in a string.
 * Unknown keys produce an empty string to avoid leaking template syntax.
 */
export function applyMergeVars(template: string, context: MergeVariableContext): string {
  return template.replace(MERGE_PATTERN, (_, key: string) => {
    const value = context[key]
    return typeof value === 'string' ? value : ''
  })
}

/**
 * Build a MergeVariableContext from lead and sending account data.
 */
export function buildMergeContext(
  lead: {
    first_name:  string | null
    last_name:   string | null
    email:       string
    company:     string | null
    title:       string | null
    website?:    string | null
  },
  sender: {
    from_name:  string
    from_email: string
  },
): MergeVariableContext {
  const first = lead.first_name ?? ''
  const last  = lead.last_name  ?? ''

  return {
    first_name:   first,
    last_name:    last,
    full_name:    [first, last].filter(Boolean).join(' '),
    company:      lead.company ?? '',
    title:        lead.title   ?? '',
    email:        lead.email,
    sender_name:  sender.from_name,
    sender_email: sender.from_email,
  }
}

/**
 * Return a list of all merge variables detected in a template string.
 * Useful for validation / preview in the compose UI.
 */
export function detectMergeVars(template: string): string[] {
  const found = new Set<string>()
  for (const match of template.matchAll(MERGE_PATTERN)) {
    found.add(match[1])
  }
  return Array.from(found)
}

/**
 * Validate that a template only uses supported merge variables.
 * Returns an array of unknown variable names (empty = all valid).
 */
const SUPPORTED_VARS = new Set([
  'first_name', 'last_name', 'full_name',
  'company', 'title', 'email',
  'sender_name', 'sender_email',
])

export function validateMergeVars(template: string): string[] {
  return detectMergeVars(template).filter((v) => !SUPPORTED_VARS.has(v))
}

/**
 * Preview a template with placeholder text (for the compose UI).
 * Unknown variables are shown as [variable_name] so the user can spot them.
 */
const PREVIEW_PLACEHOLDERS: MergeVariableContext = {
  first_name:   '[first_name]',
  last_name:    '[last_name]',
  full_name:    '[full_name]',
  company:      '[company]',
  title:        '[title]',
  email:        '[email]',
  sender_name:  '[sender_name]',
  sender_email: '[sender_email]',
}

export function previewMergeVars(template: string): string {
  return template.replace(MERGE_PATTERN, (match, key: string) => {
    return PREVIEW_PLACEHOLDERS[key] ?? `[${key}]`
  })
}

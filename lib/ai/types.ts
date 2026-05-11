/**
 * lib/ai/types.ts
 *
 * Types for the snapshot-email AI task. The wider AI feature set
 * (lead summaries, cold-email drafting, batch personalisation,
 * subject-line generation, usage dashboard, follow-up suggestions)
 * has been removed — the only remaining surface is the
 * admin-only Email Snapshot button on the intake form.
 */

export type AiModel = 'gpt-4o' | 'gpt-4o-mini'

export interface AiUsage {
  prompt:     number
  completion: number
  total:      number
}

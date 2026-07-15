/**
 * Call Mode queue types + filter parsing.
 *
 * Deliberately NOT server-only: both the server page / API route and the
 * client component import from here. Anything touching Supabase lives in
 * ./queue.ts (which IS server-only).
 */

// NOTE: no "callbacks" preset — `callback` is not a lead status in this app
// (callback promises live in the tasks system as follow_ups.type='callback').
export type QueuePreset = 'fresh' | 'retry' | 'all'

/**
 * Upper bound on one built queue. NOT a product "session cap" — the rep can
 * work the whole matching set — just a memory/payload guard, only reached on
 * workspaces with >5k matching leads in one preset. Lives here (not in the
 * server-only queue.ts) because the setup screen shows it in the
 * "start another for the rest" note.
 */
export const FETCH_CAP = 5000

export interface QueueLead {
  id:                string
  first_name:        string | null
  last_name:         string | null
  email:             string | null
  website:           string | null
  phone:             string
  company:           string | null
  title:             string | null
  status:            string
  batch_name:        string | null
  last_contacted_at: string | null
  last_call_outcome: string | null
  state:             string | null
}

/** What the API route hands back when the queue is built at "Start calling". */
export interface QueueResponse {
  leads:          QueueLead[]
  skippedNoPhone: number
  totalMatching:  number
}

const PRESETS = ['fresh', 'retry', 'all'] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseQueuePreset(v: string | undefined | null): QueuePreset {
  return PRESETS.includes(v as QueuePreset) ? (v as QueuePreset) : 'fresh'
}

/** Null unless it's a well-formed UUID — never pass raw input to the RPC. */
export function parseBatchId(v: string | undefined | null): string | null {
  return v && UUID_RE.test(v) ? v : null
}

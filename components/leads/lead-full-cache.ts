'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// ─────────────────────────────────────────────────────────────────────────────
// Short-lived client cache for the payloads behind LeadFullPanel (the lead
// side panel). Two wins:
//   1. Hover a lead row / "Full profile" button → prefetchLeadFull() warms the
//      /full + /questionnaire fetches so the click paints instantly.
//   2. In-flight dedupe — a hover already loading is reused by the click, never
//      double-fetched.
//
// Safety: the resolved copy is CONSUMED (deleted) the moment the panel takes it,
// and the panel invalidates on the in-flight path too — so an edit made inside
// the panel can never be masked by a stale cached copy on the next open. A fresh
// hover simply re-warms it.
// ─────────────────────────────────────────────────────────────────────────────

export interface LeadFullBundle {
  /** The /api/leads/[id]/full JSON (lead, activity, followUps, calls, tags, availableTags, teamMembers). */
  full:          any
  /** The /api/leads/[id]/questionnaire JSON ({ questionnaire }). */
  questionnaire: any
}

// A warmed copy is only trusted for a short window — long enough to bridge a
// hover→click, short enough that a cold reopen refetches.
const TTL_MS = 45_000

const resolved = new Map<string, { at: number; bundle: LeadFullBundle }>()
const inflight = new Map<string, Promise<LeadFullBundle>>()

async function fetchBundle(leadId: string): Promise<LeadFullBundle> {
  const [full, questionnaire] = await Promise.all([
    // 403 (rep lost access) / 404 (deleted) come back as { error } with no lead;
    // treat that as a load failure so the panel shows its error state.
    fetch(`/api/leads/${leadId}/full`).then(async (r) => {
      const json = await r.json().catch(() => ({}))
      if (!r.ok || !json.lead) throw new Error(json.error ?? 'Failed to load lead')
      return json
    }),
    fetch(`/api/leads/${leadId}/questionnaire`).then((r) => r.json()).catch(() => ({ questionnaire: null })),
  ])
  return { full, questionnaire }
}

function warm(leadId: string): Promise<LeadFullBundle> {
  const r = resolved.get(leadId)
  if (r && Date.now() - r.at < TTL_MS) return Promise.resolve(r.bundle)
  const existing = inflight.get(leadId)
  if (existing) return existing
  const p = fetchBundle(leadId)
  inflight.set(leadId, p)
  // NOTE: this .then is registered before any consumer's .then (warm runs first),
  // so the panel's invalidate on the in-flight path reliably wins the race.
  p.then((bundle) => { resolved.set(leadId, { at: Date.now(), bundle }) })
    .catch(() => {})
    .finally(() => { inflight.delete(leadId) })
  return p
}

/** Fire-and-forget warmer for hover/focus. Safe to call repeatedly. */
export function prefetchLeadFull(leadId: string | null | undefined): void {
  if (!leadId) return
  void warm(leadId).catch(() => {})
}

/**
 * Called by the panel on open. Returns a ready bundle synchronously when a warm
 * copy exists (instant, no spinner) — consuming it — otherwise a promise that
 * reuses any in-flight hover fetch.
 */
export function takeLeadFull(leadId: string):
  | { ready: LeadFullBundle }
  | { promise: Promise<LeadFullBundle> } {
  const r = resolved.get(leadId)
  if (r && Date.now() - r.at < TTL_MS) {
    resolved.delete(leadId)
    return { ready: r.bundle }
  }
  return { promise: warm(leadId) }
}

/** Drop any warmed copy so the next open refetches (call after in-panel edits). */
export function invalidateLeadFull(leadId: string): void {
  resolved.delete(leadId)
}

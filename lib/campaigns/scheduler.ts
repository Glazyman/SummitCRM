/**
 * Campaign scheduling utilities.
 *
 * Handles:
 *  - Calculating scheduled_for per lead per step
 *  - Adding randomised jitter (anti-spam: spread sends over a window)
 *  - Account rotation for multi-account campaigns
 *  - Daily overflow: push emails to next-day 08:00 UTC when quota full
 */

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum random jitter added to each email's scheduled time (minutes). */
export const JITTER_MAX_MINUTES = 45

/** Send-window start hour (UTC). Emails won't be delivered before this. */
export const SEND_WINDOW_START_HOUR = 8   // 08:00 UTC

/** Send-window end hour (UTC). Emails after this shift to next morning. */
export const SEND_WINDOW_END_HOUR = 18   // 18:00 UTC

/** Per-batch send delay range in milliseconds (anti-spam between sends). */
export const SEND_DELAY_MIN_MS = 3_000
export const SEND_DELAY_MAX_MS = 8_000

// ── Scheduled time calculation ────────────────────────────────────────────

/**
 * Calculate the `scheduled_for` timestamp for a single email in a campaign.
 *
 * @param campaignStart  ISO string — when step 1 emails should go out
 * @param stepDelayDays  How many days after campaignStart this step fires
 * @param jitterSeed     0–1 float used to deterministically spread emails
 *                       within the send window (avoids bulk sends at exactly 08:00)
 */
export function calcScheduledFor(
  campaignStart:  Date,
  stepDelayDays:  number,
  jitterSeed = Math.random(),
): Date {
  // Base date: campaign start + step delay
  const base = new Date(campaignStart)
  base.setUTCDate(base.getUTCDate() + stepDelayDays)

  // Clamp to within the send window
  const hour = base.getUTCHours()
  if (hour < SEND_WINDOW_START_HOUR) {
    base.setUTCHours(SEND_WINDOW_START_HOUR, 0, 0, 0)
  } else if (hour >= SEND_WINDOW_END_HOUR) {
    // Push to next morning
    base.setUTCDate(base.getUTCDate() + 1)
    base.setUTCHours(SEND_WINDOW_START_HOUR, 0, 0, 0)
  }

  // Add jitter: spread emails evenly across the send window
  const windowMinutes = (SEND_WINDOW_END_HOUR - SEND_WINDOW_START_HOUR) * 60
  const jitterMinutes = Math.floor(jitterSeed * Math.min(JITTER_MAX_MINUTES, windowMinutes))
  base.setUTCMinutes(base.getUTCMinutes() + jitterMinutes)

  return base
}

// ── Tomorrow 08:00 UTC (for daily overflow) ───────────────────────────────

export function tomorrowSendWindowStart(): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(SEND_WINDOW_START_HOUR, 0, 0, 0)
  return d
}

// ── Random inter-send delay ───────────────────────────────────────────────

/** Returns a random delay in milliseconds between consecutive sends. */
export function randomSendDelay(): number {
  return SEND_DELAY_MIN_MS + Math.floor(Math.random() * (SEND_DELAY_MAX_MS - SEND_DELAY_MIN_MS))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Account rotation ──────────────────────────────────────────────────────

/**
 * Selects the sending account index for lead N using round-robin rotation.
 * Ensures even distribution across multiple accounts.
 *
 * @param leadIndex   0-based position of the lead in the batch
 * @param accountIds  Array of available (non-quota-exceeded) account IDs
 */
export function rotateAccount(leadIndex: number, accountIds: string[]): string {
  if (accountIds.length === 0) throw new Error('No sending accounts available')
  return accountIds[leadIndex % accountIds.length]
}

// ── Estimated completion date ─────────────────────────────────────────────

/**
 * Given a campaign's lead count, daily limit, step count, and max step delay,
 * estimates when the last email will be sent.
 */
export function estimateCompletion(params: {
  totalLeads:     number
  dailyLimit:     number
  steps:          Array<{ delay_days: number }>
  startDate:      Date
}): Date {
  const { totalLeads, dailyLimit, steps, startDate } = params
  if (steps.length === 0 || totalLeads === 0) return startDate

  const lastStep   = steps.reduce((a, b) => a.delay_days > b.delay_days ? a : b)
  const daysForQ1  = Math.ceil(totalLeads / Math.max(1, dailyLimit))
  const totalDays  = daysForQ1 + lastStep.delay_days + 1   // +1 buffer
  const result     = new Date(startDate)
  result.setUTCDate(result.getUTCDate() + totalDays)
  result.setUTCHours(SEND_WINDOW_END_HOUR, 0, 0, 0)
  return result
}

// ── Anti-spam safeguards summary ──────────────────────────────────────────
// 1. Jitter: each email's scheduled_for is offset by up to JITTER_MAX_MINUTES
//    within the send window — prevents burst sending at exact schedule time.
// 2. Send delay: SEND_DELAY_MIN_MS–SEND_DELAY_MAX_MS sleep between actual sends
//    in the queue processor — mimics human sending cadence.
// 3. Send window: emails only scheduled 08:00–18:00 UTC — avoids off-hours
//    sends that trigger spam filters.
// 4. Daily cap: 50 emails/account/day — well below ISP bulk thresholds.
// 5. Account rotation: spreads volume across multiple sender domains.
// 6. Reply/unsubscribe skip: stops follow-up steps for engaged/opted-out leads.

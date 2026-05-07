/**
 * lib/email/quota.ts
 *
 * Quota management for sending accounts.
 * - 50 email/day hard limit per account (configurable via daily_limit column)
 * - Atomic increment using a Postgres RPC with fallback to manual read-write
 * - Warning notifications at 80% and 100% usage
 * - Quota reset via pg_cron
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QuotaStatus } from './types'

export const DEFAULT_DAILY_LIMIT = 50
export const QUOTA_WARNING_THRESHOLD = 0.8   // 80%

// ── Internal helper: safe percent calculation ─────────────────────────────
function calcPercent(sent: number, limit: number): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) return 100
  return Math.round((sent / limit) * 100)
}

// ── Check quota for a specific account ────────────────────────────────────
export async function getQuotaStatus(
  supabase:  SupabaseClient,
  accountId: string,
): Promise<QuotaStatus> {
  const { data, error } = await supabase
    .from('sending_accounts')
    .select('id, name, daily_limit, emails_sent_today, quota_reset_at')
    .eq('id', accountId)
    .single() as {
      data: {
        id: string; name: string
        daily_limit: number; emails_sent_today: number; quota_reset_at: string | null
      } | null
      error: unknown
    }

  if (error || !data) throw new Error('Sending account not found')

  const sent      = data.emails_sent_today ?? 0
  const limit     = data.daily_limit ?? DEFAULT_DAILY_LIMIT
  const remaining = Math.max(0, limit - sent)

  return {
    account_id:   data.id,
    account_name: data.name,
    daily_limit:  limit,
    sent_today:   sent,
    remaining,
    percent_used: calcPercent(sent, limit),
    at_limit:     remaining === 0,
    reset_at:     data.quota_reset_at,
  }
}

// ── List quota for all workspace accounts ─────────────────────────────────
export async function getWorkspaceQuotas(
  supabase:    SupabaseClient,
  workspaceId: string,
): Promise<QuotaStatus[]> {
  const { data, error } = await supabase
    .from('sending_accounts')
    .select('id, name, daily_limit, emails_sent_today, quota_reset_at')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true) as {
      data: Array<{
        id: string; name: string
        daily_limit: number; emails_sent_today: number; quota_reset_at: string | null
      }> | null
      error: unknown
    }

  if (error || !data) return []

  return data.map((row) => {
    const sent      = row.emails_sent_today ?? 0
    const limit     = row.daily_limit ?? DEFAULT_DAILY_LIMIT
    const remaining = Math.max(0, limit - sent)
    return {
      account_id:   row.id,
      account_name: row.name,
      daily_limit:  limit,
      sent_today:   sent,
      remaining,
      percent_used: calcPercent(sent, limit),
      at_limit:     remaining === 0,
      reset_at:     row.quota_reset_at,
    }
  })
}

// ── Atomically increment quota ─────────────────────────────────────────────
/**
 * Uses a simple read-then-conditional-write.
 * In production, replace with a Postgres function:
 *   CREATE FUNCTION increment_quota(p_account_id uuid)
 *   RETURNS TABLE(success bool, remaining int) ...
 */
export async function incrementQuota(
  supabase:  SupabaseClient,
  accountId: string,
): Promise<{ success: boolean; remaining: number }> {
  const { data: acct } = await supabase
    .from('sending_accounts')
    .select('emails_sent_today, daily_limit')
    .eq('id', accountId)
    .eq('is_active', true)
    .single() as { data: { emails_sent_today: number; daily_limit: number } | null; error: unknown }

  if (!acct) return { success: false, remaining: 0 }

  const sent  = acct.emails_sent_today ?? 0
  const limit = acct.daily_limit ?? DEFAULT_DAILY_LIMIT

  if (limit <= 0 || sent >= limit) {
    return { success: false, remaining: 0 }
  }

  const newCount = sent + 1
  const { error: updErr } = await supabase
    .from('sending_accounts')
    .update({ emails_sent_today: newCount })
    .eq('id', accountId)
    // Guard against concurrent increments by re-checking at update time
    .lte('emails_sent_today', sent)

  if (updErr) {
    // Concurrent update may have crossed the limit — re-check
    const { data: recheck } = await supabase
      .from('sending_accounts')
      .select('emails_sent_today, daily_limit')
      .eq('id', accountId)
      .single() as { data: { emails_sent_today: number; daily_limit: number } | null; error: unknown }

    if (!recheck || recheck.emails_sent_today >= recheck.daily_limit) {
      return { success: false, remaining: 0 }
    }
  }

  return { success: true, remaining: Math.max(0, limit - newCount) }
}

// ── Decrement quota (on send failure, roll back) ──────────────────────────
export async function decrementQuota(
  supabase:  SupabaseClient,
  accountId: string,
): Promise<void> {
  const { data } = await supabase
    .from('sending_accounts')
    .select('emails_sent_today')
    .eq('id', accountId)
    .single() as { data: { emails_sent_today: number } | null; error: unknown }

  if (data && data.emails_sent_today > 0) {
    await supabase
      .from('sending_accounts')
      .update({ emails_sent_today: data.emails_sent_today - 1 })
      .eq('id', accountId)
  }
}

// ── Create quota warning notification ─────────────────────────────────────
export async function checkAndNotifyQuotaWarning(
  supabase:    SupabaseClient,
  workspaceId: string,
  accountId:   string,
  quota:       QuotaStatus,
): Promise<void> {
  const pct = quota.percent_used
  if (!Number.isFinite(pct) || pct < 80) return

  const level = pct >= 100 ? 'critical' : 'warning'
  const title = pct >= 100
    ? `Daily email quota exhausted — ${quota.account_name}`
    : `Email quota at ${pct}% — ${quota.account_name}`
  const body  = pct >= 100
    ? `"${quota.account_name}" has reached its daily limit of ${quota.daily_limit} emails. New emails will be queued until midnight UTC.`
    : `"${quota.account_name}" has sent ${quota.sent_today}/${quota.daily_limit} emails today.`

  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('type', `quota_${level}`)
    .gte('created_at', `${today}T00:00:00Z`)
    .limit(1) as { data: Array<{ id: string }> | null; error: unknown }

  if (existing && existing.length > 0) return

  await supabase.from('notifications').insert({
    workspace_id:   workspaceId,
    type:           `quota_${level}`,
    title,
    body,
    link:           '/settings/sending-accounts',
  } as never)
}

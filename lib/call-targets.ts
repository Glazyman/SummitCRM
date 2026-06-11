/**
 * Single source of truth for resolving a user's effective daily call target
 * from workspace settings. Used by the dashboard KPI, the admin
 * rep-performance report, and Call Mode — keep them agreeing.
 *
 * Resolution: per-rep override (settings.rep_daily_call_targets[userId])
 * → workspace default (settings.daily_call_target) → 100.
 */
export function resolveDailyCallTarget(
  settings: Record<string, unknown> | null | undefined,
  userId: string,
): number {
  const s = settings ?? {}
  const overrideMap = (s.rep_daily_call_targets ?? {}) as Record<string, unknown>
  const override = Number(overrideMap[userId])
  if (Number.isFinite(override) && override > 0) return Math.floor(override)
  const workspaceDefault = Number(s.daily_call_target)
  if (Number.isFinite(workspaceDefault) && workspaceDefault > 0) return Math.floor(workspaceDefault)
  return 100
}

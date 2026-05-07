/**
 * lib/security/audit.ts
 *
 * Append-only audit log for security-sensitive operations.
 * Writes to `audit_logs` via the service role — never through user RLS.
 * All inserts are non-blocking (fire-and-forget with error swallowed)
 * so a log failure never blocks the user-facing operation.
 *
 * Events to log (from docs/13-security-and-compliance.md):
 *   member_invited, member_role_changed, member_deactivated,
 *   sending_account_added, sending_account_removed,
 *   campaign_created, campaign_cancelled,
 *   bulk_lead_delete, data_export_requested, data_deletion_requested,
 *   ai_budget_exceeded, failed_login_attempts,
 *   api_key_rotated, webhook_invalid_signature
 */

import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export type AuditAction =
  | 'member_invited'
  | 'member_role_changed'
  | 'member_deactivated'
  | 'sending_account_added'
  | 'sending_account_removed'
  | 'campaign_created'
  | 'campaign_cancelled'
  | 'bulk_lead_delete'
  | 'data_export_requested'
  | 'data_deletion_requested'
  | 'ai_budget_exceeded'
  | 'failed_login_attempts'
  | 'api_key_rotated'
  | 'webhook_invalid_signature'
  | 'lead_import'
  | 'settings_changed'

export interface AuditEntry {
  workspaceId:   string
  actorId:       string | null
  action:        AuditAction
  resourceType?: string
  resourceId?:   string
  metadata?:     Record<string, unknown>
  /** Optionally pass the request to extract IP/UA */
  request?:      NextRequest | Request
}

/**
 * Write one row to audit_logs. Fire-and-forget — errors are logged but
 * never thrown to callers.
 */
export function auditLog(entry: AuditEntry): void {
  _writeAuditLog(entry).catch((err) => {
    // Audit log failures must never interrupt the main flow
    console.error('[audit] Failed to write audit log:', (err as Error).message ?? err)
  })
}

async function _writeAuditLog(entry: AuditEntry): Promise<void> {
  const db = createAdminClient() as any // eslint-disable-line @typescript-eslint/no-explicit-any

  const ip = entry.request
    ? (entry.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null)
    : null

  const ua = entry.request
    ? (entry.request.headers.get('user-agent') ?? null)
    : null

  await db.from('audit_logs').insert({
    workspace_id:  entry.workspaceId,
    actor_id:      entry.actorId ?? null,
    action:        entry.action,
    resource_type: entry.resourceType ?? null,
    resource_id:   entry.resourceId   ?? null,
    metadata:      entry.metadata     ?? {},
    ip_address:    ip,
    user_agent:    sanitizeUserAgent(ua),
  })
}

/** Truncate/strip UA to prevent log injection */
function sanitizeUserAgent(ua: string | null): string | null {
  if (!ua) return null
  // Truncate to 512 chars, strip newlines
  return ua.replace(/[\r\n]/g, ' ').slice(0, 512)
}

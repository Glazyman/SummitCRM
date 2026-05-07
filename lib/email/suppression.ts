/**
 * lib/email/suppression.ts
 *
 * Suppression list enforcement.
 * A lead is suppressed (cannot receive email) if ANY of the following is true:
 *   1. lead.is_unsubscribed = true
 *   2. lead.status = 'do_not_contact'
 *   3. The email address appears in the global unsubscribes table
 *   4. The email has had a previous hard bounce (email_bounced status)
 *   5. The email has had a spam complaint
 *
 * This is checked BEFORE any send attempt and returns a structured reason
 * so the UI can show the correct message.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SuppressionResult } from './types'

export async function checkSuppression(
  supabase:    SupabaseClient,
  workspaceId: string,
  leadId:      string,
): Promise<SuppressionResult> {

  // ── 1. Fetch lead status + unsubscribe flag ─────────────────────────────
  const { data: lead } = await supabase
    .from('leads')
    .select('email, status, is_unsubscribed')
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .single() as {
      data: { email: string; status: string; is_unsubscribed: boolean } | null
      error: unknown
    }

  if (!lead) {
    return { suppressed: true, reason: 'do_not_contact', email: undefined }
  }

  if (lead.is_unsubscribed) {
    return { suppressed: true, reason: 'unsubscribed', email: lead.email }
  }

  if (lead.status === 'do_not_contact') {
    return { suppressed: true, reason: 'do_not_contact', email: lead.email }
  }

  // ── 2. Check global unsubscribes table ─────────────────────────────────
  const { data: unsub } = await supabase
    .from('unsubscribes')
    .select('id')
    .eq('email', lead.email.toLowerCase())
    .eq('workspace_id', workspaceId)
    .limit(1) as { data: Array<{ id: string }> | null; error: unknown }

  if (unsub && unsub.length > 0) {
    return { suppressed: true, reason: 'unsubscribed', email: lead.email }
  }

  // ── 3. Check for prior hard bounce or spam complaint ───────────────────
  const { data: badEmail } = await supabase
    .from('emails')
    .select('status')
    .eq('lead_id', leadId)
    .in('status', ['bounced', 'spam_complaint'])
    .limit(1) as { data: Array<{ status: string }> | null; error: unknown }

  if (badEmail && badEmail.length > 0) {
    const reason = badEmail[0].status === 'spam_complaint'
      ? 'spam_complaint'
      : 'bounced'
    return { suppressed: true, reason, email: lead.email }
  }

  return { suppressed: false }
}

/**
 * Record an unsubscribe event.
 * Updates the lead record AND inserts into the global unsubscribes table.
 */
export async function recordUnsubscribe(
  supabase:    SupabaseClient,
  workspaceId: string,
  emailAddress:string,
  token:       string,
): Promise<{ success: boolean; error?: string }> {
  // Find the lead by email + workspace
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('email', emailAddress.toLowerCase())
    .eq('workspace_id', workspaceId)
    .single() as { data: { id: string } | null; error: unknown }

  // Mark lead as unsubscribed
  if (lead) {
    await supabase
      .from('leads')
      .update({ is_unsubscribed: true })
      .eq('id', lead.id)

    await supabase.from('activity_logs').insert({
      workspace_id: workspaceId,
      lead_id:      lead.id,
      type:         'unsubscribed',
      metadata:     { source: 'email_link', token },
    })
  }

  // Insert into global unsubscribes (idempotent)
  const { error } = await supabase
    .from('unsubscribes')
    .upsert(
      { workspace_id: workspaceId, email: emailAddress.toLowerCase(), source: 'email_link' },
      { onConflict: 'workspace_id,email' }
    )

  if (error) {
    return { success: false, error: String(error) }
  }

  return { success: true }
}

/**
 * Resolve an unsubscribe token → find the associated email record + lead.
 * Returns the email address if token is valid, null otherwise.
 */
export async function resolveUnsubscribeToken(
  supabase: SupabaseClient,
  token:    string,
): Promise<{ email: string; workspace_id: string } | null> {
  const { data } = await supabase
    .from('emails')
    .select('workspace_id, leads(email)')
    .eq('unsubscribe_token', token)
    .single() as {
      data: { workspace_id: string; leads: { email: string } | null } | null
      error: unknown
    }

  if (!data || !data.leads) return null
  return { email: data.leads.email, workspace_id: data.workspace_id }
}

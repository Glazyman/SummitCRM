/**
 * POST /api/emails/send
 *
 * Send a single personalised email to a lead.
 * This is the synchronous path for individual emails (not bulk campaigns).
 *
 * Flow:
 *   1. Auth + workspace check
 *   2. Suppression check (unsubscribed / DNC / bounced)
 *   3. Quota check (50/day per account)
 *   4. Apply merge variables to subject + body
 *   5. Inject tracking pixel, wrap links, add unsubscribe footer
 *   6. Insert email record (status = 'queued')
 *   7. Attempt immediate send
 *   8. On success: update status = 'sent', increment quota
 *   9. On failure: retry policy handled by process-email-queue edge function
 *  10. Log activity_logs entry
 *
 * Auth: rep+
 * Rate limit: 10 sends per minute per user (enforced via Upstash / middleware)
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { checkSuppression } from '@/lib/email/suppression'
import { incrementQuota, decrementQuota, checkAndNotifyQuotaWarning, getQuotaStatus } from '@/lib/email/quota'
import { buildMergeContext, applyMergeVars } from '@/lib/email/merge'
import { buildSendableHtml, generateTrackingPixelId, generateUnsubscribeToken, htmlToText } from '@/lib/email/tracking'
import { dispatchEmail } from '@/lib/email/sender'
import { rateLimit, rateLimitResponse, EMAIL_LIMIT } from '@/lib/security/rate-limit'

const sendSchema = z.object({
  lead_id:            z.string().uuid(),
  sending_account_id: z.string().uuid(),
  subject:            z.string().min(1).max(500),
  body_html:          z.string().min(1),
  scheduled_for:      z.string().datetime().optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const adminClient = createAdminClient()

    // ── Auth ───────────────────────────────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    // ── Rate limit per workspace ───────────────────────────────────────
    const rl = rateLimit(member.workspace_id, EMAIL_LIMIT.prefix, EMAIL_LIMIT.limit, EMAIL_LIMIT.windowMs)
    if (!rl.success) return rateLimitResponse(rl.resetIn)

    // ── Validate input ─────────────────────────────────────────────────
    const body   = await req.json()
    const parsed = sendSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const { lead_id, sending_account_id, subject, body_html, scheduled_for } = parsed.data

    // ── Suppression check ──────────────────────────────────────────────
    const suppression = await checkSuppression(supabase, member.workspace_id, lead_id)
    if (suppression.suppressed) {
      const messages: Record<string, string> = {
        unsubscribed:    'This lead has unsubscribed and cannot receive emails.',
        do_not_contact:  'This lead is marked Do Not Contact.',
        bounced:         'Previous emails to this lead have hard-bounced.',
        spam_complaint:  'This lead has filed a spam complaint.',
      }
      return NextResponse.json({
        error:  messages[suppression.reason ?? 'unsubscribed'] ?? 'Lead is suppressed.',
        reason: suppression.reason,
      }, { status: 400 })
    }

    // ── Fetch lead ─────────────────────────────────────────────────────
    const { data: lead } = await supabase
      .from('leads')
      .select('id, email, first_name, last_name, company, title')
      .eq('id', lead_id)
      .eq('workspace_id', member.workspace_id)
      .single() as {
        data: { id: string; email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null } | null
        error: unknown
      }

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // ── Fetch sending account (with vault references — admin client) ───
    const { data: account } = await adminClient
      .from('sending_accounts')
      .select(
        'id, type, from_email, from_name, is_active, daily_limit, emails_sent_today, ' +
        'resend_key_id, smtp_host, smtp_port, smtp_user, smtp_pass_id, smtp_secure'
      )
      .eq('id', sending_account_id)
      .eq('workspace_id', member.workspace_id)
      .single() as {
        data: {
          id: string; type: 'resend' | 'smtp'
          from_email: string; from_name: string; is_active: boolean
          daily_limit: number; emails_sent_today: number
          resend_key_id: string | null; smtp_host: string | null; smtp_port: number | null
          smtp_user: string | null; smtp_pass_id: string | null; smtp_secure: boolean
        } | null
        error: unknown
      }

    if (!account) return NextResponse.json({ error: 'Sending account not found' }, { status: 404 })
    if (!account.is_active) return NextResponse.json({ error: 'Sending account is inactive' }, { status: 400 })

    // ── Quota check ────────────────────────────────────────────────────
    if (account.emails_sent_today >= account.daily_limit) {
      // Queue for tomorrow 8am UTC instead of rejecting
      const tomorrow = new Date()
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      tomorrow.setUTCHours(8, 0, 0, 0)
      const queuedFor = scheduled_for ?? tomorrow.toISOString()

      const pixelId  = generateTrackingPixelId()
      const unsubTok = generateUnsubscribeToken()
      const mergeCtx = buildMergeContext(lead, account)
      const finalSubject = applyMergeVars(subject, mergeCtx)
      const finalHtml    = applyMergeVars(body_html, mergeCtx)

      const { data: queued } = await adminClient
        .from('emails')
        .insert({
          workspace_id:       member.workspace_id,
          lead_id,
          sending_account_id,
          sent_by:            user.id,
          subject:            finalSubject,
          body_html:          finalHtml,
          body_text:          htmlToText(finalHtml),
          status:             'queued',
          tracking_pixel_id:  pixelId,
          unsubscribe_token:  unsubTok,
          scheduled_for:      queuedFor,
        })
        .select('id')
        .single() as { data: { id: string } | null; error: unknown }

      return NextResponse.json({
        email_id: queued?.id,
        status:   'queued',
        message:  `Quota exceeded — email scheduled for ${queuedFor}`,
        queued_for: queuedFor,
      }, { status: 202 })
    }

    // ── Build final email HTML ─────────────────────────────────────────
    const pixelId  = generateTrackingPixelId()
    const unsubTok = generateUnsubscribeToken()
    const mergeCtx = buildMergeContext(lead, account)
    const finalSubject = applyMergeVars(subject, mergeCtx)
    const mergedHtml   = applyMergeVars(body_html, mergeCtx)

    // Insert record with 'queued' status first (get the ID for tracking URLs)
    const { data: emailRow } = await adminClient
      .from('emails')
      .insert({
        workspace_id:       member.workspace_id,
        lead_id,
        sending_account_id,
        sent_by:            user.id,
        subject:            finalSubject,
        body_html:          mergedHtml,
        body_text:          htmlToText(mergedHtml),
        status:             'queued',
        tracking_pixel_id:  pixelId,
        unsubscribe_token:  unsubTok,
        scheduled_for:      scheduled_for ?? null,
      })
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }

    if (!emailRow) throw new Error('Failed to create email record')

    const emailId = emailRow.id

    // Inject tracking (pixel ID + click wrapping + unsub footer)
    const sendableHtml = buildSendableHtml({
      html:             mergedHtml,
      emailId,
      pixelId,
      unsubscribeToken: unsubTok,
      fromName:         account.from_name,
    })

    // ── Attempt immediate send ─────────────────────────────────────────
    const { success: quotaOk } = await incrementQuota(supabase, sending_account_id)
    if (!quotaOk) {
      // Race condition — another request consumed the last quota slot
      await adminClient.from('emails').update({ status: 'queued' }).eq('id', emailId)
      return NextResponse.json({ email_id: emailId, status: 'queued' }, { status: 202 })
    }

    const result = await dispatchEmail(adminClient, account, {
      to:         lead.email,
      from_email: account.from_email,
      from_name:  account.from_name,
      subject:    finalSubject,
      html:       sendableHtml,
      text:       htmlToText(sendableHtml),
    })

    if (result.success) {
      await adminClient
        .from('emails')
        .update({
          status:            'sent',
          sent_at:           new Date().toISOString(),
          resend_message_id: result.message_id,
        })
        .eq('id', emailId)

      // Log activity
      await adminClient.from('activity_logs').insert({
        workspace_id: member.workspace_id,
        lead_id,
        user_id:      user.id,
        type:         'email_sent',
        metadata:     { subject: finalSubject, email_id: emailId },
      })

      // Check quota warning
      const quota = await getQuotaStatus(supabase, sending_account_id)
      await checkAndNotifyQuotaWarning(supabase, member.workspace_id, sending_account_id, quota)

      return NextResponse.json({ email_id: emailId, status: 'sent', message_id: result.message_id })
    } else {
      // Roll back quota increment on failure
      await decrementQuota(supabase, sending_account_id)
      await adminClient
        .from('emails')
        .update({ status: 'failed' })
        .eq('id', emailId)

      return NextResponse.json({ error: result.error ?? 'Send failed', email_id: emailId }, { status: 500 })
    }

  } catch (err) {
    console.error('[emails/send]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

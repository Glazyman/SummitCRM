/**
 * POST /api/webhooks/resend
 *
 * Resend webhook handler for delivery events.
 * Events: email.sent, email.delivered, email.opened, email.clicked,
 *         email.bounced, email.spam_complaint
 *
 * Security:
 *   - Validates webhook signature using Svix (Resend's signing library)
 *   - FAIL-CLOSED: if RESEND_WEBHOOK_SECRET is not set, ALL requests are rejected
 *   - Returns 200 immediately to prevent Resend retry storms
 *   - All DB work happens in background after response
 *
 * Register this URL in Resend dashboard → Webhooks.
 * Set RESEND_WEBHOOK_SECRET to the signing secret shown in the Resend dashboard.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Webhook, WebhookRequiredHeaders } from 'svix'
import { createAdminClient } from '@/lib/supabase/server'
import type { ResendWebhookEvent } from '@/lib/email/types'

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  // ── Fail-closed: secret MUST be configured ────────────────────────────
  if (!WEBHOOK_SECRET) {
    console.error('[webhook/resend] RESEND_WEBHOOK_SECRET is not set — rejecting all webhook requests')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // ── Read raw body (required for signature verification) ───────────────
  const rawBody = await req.text()

  // ── Svix signature verification ───────────────────────────────────────
  const svixId        = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.warn('[webhook/resend] Missing svix headers')
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 })
  }

  const headers: WebhookRequiredHeaders = {
    'svix-id':        svixId,
    'svix-timestamp': svixTimestamp,
    'svix-signature': svixSignature,
  }

  let event: ResendWebhookEvent
  try {
    const wh = new Webhook(WEBHOOK_SECRET)
    event = wh.verify(rawBody, headers) as ResendWebhookEvent
  } catch (err) {
    console.warn('[webhook/resend] Signature verification failed:', (err as Error).message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // ── Parse the verified event body ─────────────────────────────────────
  let parsed: ResendWebhookEvent
  try {
    parsed = JSON.parse(rawBody) as ResendWebhookEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Acknowledge immediately — process in background
  handleEvent(parsed).catch((err) => {
    console.error('[webhook/resend handler]', err instanceof Error ? err.message : err)
  })

  return NextResponse.json({ received: true })
}

// ── Event handler ─────────────────────────────────────────────────────────
async function handleEvent(event: ResendWebhookEvent): Promise<void> {
  const adminClient = createAdminClient()
  const now = new Date().toISOString()
  const messageId = event.data.message_id ?? event.data.email_id

  if (!messageId) return

  const { data: email } = await (adminClient as any)
    .from('emails')
    .select('id, lead_id, workspace_id, created_by, status')
    .eq('resend_message_id', messageId)
    .single() as {
      data: { id: string; lead_id: string; workspace_id: string; created_by: string; status: string } | null
      error: unknown
    }

  if (!email) {
    console.warn(`[webhook/resend] No email found for message_id: ${messageId}`)
    return
  }

  const db = adminClient as any

  switch (event.type) {
    case 'email.sent':
    case 'email.delivered':
      if (['queued', 'sending'].includes(email.status)) {
        await db.from('emails').update({ status: 'sent', sent_at: now }).eq('id', email.id)
      }
      break

    case 'email.opened':
      if (['queued', 'sending', 'sent'].includes(email.status)) {
        await db.from('emails').update({ status: 'opened', opened_at: now }).eq('id', email.id)
        await logActivity(db, email, 'email_opened', { message_id: messageId })
      }
      break

    case 'email.clicked':
      if (['queued', 'sending', 'sent', 'opened'].includes(email.status)) {
        await db.from('emails').update({ status: 'clicked', clicked_at: now }).eq('id', email.id)
        await logActivity(db, email, 'email_clicked', {
          message_id: messageId,
          url: event.data.click?.link,
        })
      }
      break

    case 'email.bounced': {
      const bounceReason = event.data.bounce?.message ?? 'Unknown bounce reason'
      await db.from('emails').update({ status: 'bounced', bounced_at: now, bounce_reason: bounceReason }).eq('id', email.id)
      await logActivity(db, email, 'email_bounced', { message_id: messageId, reason: bounceReason })

      // Notify sender (not workspace — sender gets it first)
      if (email.created_by) {
        await db.from('notifications').insert({
          workspace_id: email.workspace_id,
          user_id:      email.created_by,
          type:         'bounce',
          title:        'Email bounced',
          body:         `Hard bounce: ${bounceReason.slice(0, 120)}`,
          link:         `/leads/${email.lead_id}`,
          email_id:     email.id,
          lead_id:      email.lead_id,
        })
      }
      break
    }

    case 'email.spam_complaint': {
      await db.from('emails').update({ status: 'spam_complaint' }).eq('id', email.id)

      const toEmail = Array.isArray(event.data.to) ? event.data.to[0] : event.data.to
      if (toEmail) {
        const addr = (toEmail as string).toLowerCase()
        await db.from('unsubscribes').upsert(
          { workspace_id: email.workspace_id, email: addr, source: 'spam_complaint' },
          { onConflict: 'workspace_id,email' }
        )
        await db.from('leads')
          .update({ is_unsubscribed: true })
          .eq('email', addr)
          .eq('workspace_id', email.workspace_id)
      }
      await logActivity(db, email, 'unsubscribed', { source: 'spam_complaint', message_id: messageId })
      break
    }
  }
}

// ── Activity log helper ────────────────────────────────────────────────────
async function logActivity(
  client:   any, // eslint-disable-line @typescript-eslint/no-explicit-any
  email:    { id: string; lead_id: string; workspace_id: string },
  type:     string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.from('activity_logs').insert({
    workspace_id: email.workspace_id,
    lead_id:      email.lead_id,
    user_id:      null,
    type,
    metadata:     { email_id: email.id, ...metadata },
  })
}

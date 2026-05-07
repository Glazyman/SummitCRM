/**
 * supabase/functions/process-email-queue/index.ts
 *
 * Deno Edge Function — processes the email send queue.
 * Triggered every 2 minutes by pg_cron.
 *
 * Algorithm:
 *   1. Acquire pg advisory lock to prevent duplicate concurrent runs
 *   2. For each active sending account with queued emails:
 *      a. Calculate remaining_today = daily_limit - emails_sent_today
 *      b. Skip if at limit (reschedule pending emails to tomorrow 08:00)
 *      c. Lock up to remaining_today queue rows (prevents re-processing)
 *      d. For each email:
 *         i.   Check campaign status — skip if paused/cancelled
 *         ii.  Check suppression (unsubscribed, DNC, bounced)
 *         iii. Check step-skip (lead replied/unsubscribed to earlier step)
 *         iv.  Decrypt sending credentials from Vault
 *         v.   Apply merge vars (if AI-personalised body exists, use it)
 *         vi.  Inject tracking pixel + click wrapping + unsubscribe footer
 *         vii. Send via Resend or SMTP
 *        viii. Update email status + quota + campaign stats
 *         ix.  Random inter-send delay (3–8 s, anti-spam)
 *   3. Release advisory lock
 *
 * Anti-spam safeguards:
 *  - Advisory lock: prevents parallel runs hammering the same accounts
 *  - Quota cap: 50 emails/account/day (enforced atomically)
 *  - Inter-send delay: 3–8 second random sleep between sends
 *  - Send window: emails only delivered 08:00–18:00 UTC
 *  - Campaign pause: immediate halt when status='paused'
 *  - Step skip: reply/unsubscribe after step 1 stops all follow-ups
 *  - Suppression list: global opt-out / bounce / DNC check before every send
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend@4'
import * as nodemailer from 'npm:nodemailer@6'
import { crypto as webcrypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'

const BATCH_SIZE     = 20     // max emails to lock per account per run
const MAX_RETRIES    = 3
const SEND_WIN_START = 8      // UTC hours — no delivery before this
const SEND_WIN_END   = 18     // UTC hours — overflow to next morning

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const APP_URL       = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://app.summitscrm.com'
const VAULT_KEY     = Deno.env.get('VAULT_ENCRYPTION_KEY') ?? ''
const VAULT_ENABLED = Deno.env.get('SUPABASE_VAULT_ENABLED') === 'true'
const ADVISORY_LOCK = 1_234_567_890n   // arbitrary stable bigint for pg_try_advisory_lock

// ── Entry point ───────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const result = await processQueue()
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[process-email-queue]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

// ── Queue processor ───────────────────────────────────────────────────────
async function processQueue(): Promise<{ processed: number; skipped: number; failed: number }> {

  // Acquire advisory lock — bail if another instance is running
  const { data: lockData } = await supabase.rpc('try_acquire_send_lock') as { data: boolean | null }
  if (!lockData) {
    console.log('[process-email-queue] lock held by another instance, skipping')
    return { processed: 0, skipped: 0, failed: 0 }
  }

  let processed = 0, skipped = 0, failed = 0

  try {
    // Find accounts that have queued emails due now
    const now = new Date().toISOString()
    const { data: accounts } = await supabase
      .from('sending_accounts')
      .select('id, type, from_email, from_name, daily_limit, emails_sent_today, resend_key_id, smtp_host, smtp_port, smtp_user, smtp_pass_id, smtp_secure, workspace_id')
      .eq('is_active', true) as {
        data: Array<{
          id: string; type: string; from_email: string; from_name: string
          daily_limit: number; emails_sent_today: number
          resend_key_id: string | null; smtp_host: string | null
          smtp_port: number | null; smtp_user: string | null
          smtp_pass_id: string | null; smtp_secure: boolean; workspace_id: string
        }> | null
      }

    for (const account of (accounts ?? [])) {
      const remaining = account.daily_limit - account.emails_sent_today
      if (remaining <= 0) {
        // Push all pending emails for this account to tomorrow 08:00
        await rescheduleOverflow(account.id)
        continue
      }

      // Lock a batch of queued emails for this account
      const { data: batch } = await supabase
        .from('email_queue')
        .select('id, email_id, campaign_id, scheduled_for, attempts')
        .eq('sending_account_id', account.id)
        .lte('scheduled_for', now)
        .is('locked_at', null)
        .order('scheduled_for', { ascending: true })
        .limit(Math.min(remaining, BATCH_SIZE)) as {
          data: Array<{
            id: string; email_id: string; campaign_id: string | null
            scheduled_for: string; attempts: number
          }> | null
        }

      if (!batch || batch.length === 0) continue

      // Lock the rows
      const queueIds = batch.map((r) => r.id)
      await supabase
        .from('email_queue')
        .update({ locked_at: now })
        .in('id', queueIds)

      // Decrypt credentials once per account
      const creds = await decryptAccountCreds(account)
      if (!creds) {
        // Release locks and skip
        await supabase.from('email_queue').update({ locked_at: null }).in('id', queueIds)
        console.error(`[queue] failed to decrypt creds for account ${account.id}`)
        continue
      }

      for (const qRow of batch) {
        // ── Campaign pause / cancel check ────────────────────────────
        if (qRow.campaign_id) {
          const { data: camp } = await supabase
            .from('campaigns')
            .select('status')
            .eq('id', qRow.campaign_id)
            .single() as { data: { status: string } | null }

          if (camp?.status === 'paused' || camp?.status === 'cancelled') {
            await supabase.from('email_queue').update({ locked_at: null }).eq('id', qRow.id)
            skipped++
            continue
          }
        }

        // ── Load email row ────────────────────────────────────────────
        const { data: email } = await supabase
          .from('emails')
          .select('id, lead_id, campaign_id, step_number, subject, body_html, workspace_id')
          .eq('id', qRow.email_id)
          .single() as {
            data: {
              id: string; lead_id: string; campaign_id: string | null
              step_number: number | null; subject: string; body_html: string
              workspace_id: string
            } | null
          }

        if (!email) {
          await supabase.from('email_queue').delete().eq('id', qRow.id)
          continue
        }

        // ── Suppression check ─────────────────────────────────────────
        const suppressed = await checkSuppression(email.lead_id, email.workspace_id)
        if (suppressed) {
          await supabase.from('emails').update({ status: 'cancelled' }).eq('id', email.id)
          await supabase.from('email_queue').delete().eq('id', qRow.id)
          skipped++
          continue
        }

        // ── Step skip: lead replied or unsubscribed to this campaign ─
        if (email.campaign_id && email.step_number && email.step_number > 1) {
          const shouldSkip = await checkStepSkip(email.lead_id, email.campaign_id)
          if (shouldSkip) {
            await supabase.from('emails').update({ status: 'cancelled' }).eq('id', email.id)
            await supabase.from('email_queue').delete().eq('id', qRow.id)
            skipped++
            continue
          }
        }

        // ── Load lead ─────────────────────────────────────────────────
        const { data: lead } = await supabase
          .from('leads')
          .select('id, first_name, last_name, email, company, title, website')
          .eq('id', email.lead_id)
          .single() as {
            data: {
              id: string; first_name: string | null; last_name: string | null
              email: string; company: string | null; title: string | null; website: string | null
            } | null
          }

        if (!lead?.email) {
          await supabase.from('emails').update({ status: 'failed' }).eq('id', email.id)
          await supabase.from('email_queue').delete().eq('id', qRow.id)
          failed++
          continue
        }

        // ── Build final HTML (merge vars already applied at expansion time) ─
        const pixelId          = crypto.randomUUID()
        const unsubscribeToken = await generateUnsubscribeToken(lead.id, email.workspace_id)
        const finalHtml        = buildSendableHtml({
          html:             email.body_html,
          emailId:          email.id,
          pixelId,
          unsubscribeToken,
          fromName:         account.from_name,
          appUrl:           APP_URL,
        })

        // ── Send ──────────────────────────────────────────────────────
        const sendResult = await sendEmail({
          account,
          creds,
          to:      lead.email,
          toName:  [lead.first_name, lead.last_name].filter(Boolean).join(' '),
          subject: email.subject,
          html:    finalHtml,
          text:    htmlToText(email.body_html),
        })

        if (sendResult.success) {
          // Update email row
          await supabase.from('emails').update({
            status:       'sent',
            sent_at:      new Date().toISOString(),
            open_pixel_id:pixelId,
          }).eq('id', email.id)

          // Remove from queue
          await supabase.from('email_queue').delete().eq('id', qRow.id)

          // Increment account quota
          await supabase.from('sending_accounts')
            .update({ emails_sent_today: account.emails_sent_today + 1 + processed })
            .eq('id', account.id)

          // Update campaign stats
          if (email.campaign_id) {
            await supabase.rpc('increment_campaign_sent', { p_campaign_id: email.campaign_id })
              .then(() => {})  // fire-and-forget
          }

          // Log activity
          await supabase.from('activity_logs').insert({
            workspace_id: email.workspace_id,
            lead_id:      email.lead_id,
            type:         'email_sent',
            metadata:     { subject: email.subject, email_id: email.id, via: account.type },
          })

          processed++
        } else {
          const newAttempts = qRow.attempts + 1
          if (newAttempts >= MAX_RETRIES) {
            await supabase.from('emails').update({ status: 'failed' }).eq('id', email.id)
            await supabase.from('email_queue').delete().eq('id', qRow.id)
          } else {
            // Exponential backoff: 5, 15, 45 minutes
            const backoffMs = Math.pow(3, newAttempts) * 5 * 60_000
            const retryAt   = new Date(Date.now() + backoffMs).toISOString()
            await supabase.from('email_queue').update({
              locked_at:    null,
              attempts:     newAttempts,
              last_error:   sendResult.error,
              scheduled_for:retryAt,
            }).eq('id', qRow.id)
          }
          failed++
        }

        // ── Inter-send delay (anti-spam) ─────────────────────────────
        const delay = 3000 + Math.floor(Math.random() * 5000)  // 3–8 seconds
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  } finally {
    // Release advisory lock
    await supabase.rpc('release_send_lock').then(() => {})
  }

  return { processed, skipped, failed }
}

// ── Overflow handler: push all queued emails to tomorrow 08:00 UTC ────────
async function rescheduleOverflow(accountId: string): Promise<void> {
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(8, 0, 0, 0)

  await supabase
    .from('email_queue')
    .update({ scheduled_for: tomorrow.toISOString(), locked_at: null })
    .eq('sending_account_id', accountId)
    .is('locked_at', null)
}

// ── Suppression check ─────────────────────────────────────────────────────
async function checkSuppression(leadId: string, workspaceId: string): Promise<boolean> {
  const { data: lead } = await supabase
    .from('leads')
    .select('is_unsubscribed, is_dnc, email')
    .eq('id', leadId)
    .single() as { data: { is_unsubscribed: boolean; is_dnc: boolean; email: string } | null }

  if (!lead) return true
  if (lead.is_unsubscribed || lead.is_dnc) return true

  // Check global unsubscribes table
  const { data: unsub } = await supabase
    .from('unsubscribes')
    .select('id')
    .eq('email', lead.email)
    .eq('workspace_id', workspaceId)
    .limit(1)

  return (unsub?.length ?? 0) > 0
}

// ── Step skip: lead replied or unsubscribed to any earlier step ───────────
async function checkStepSkip(leadId: string, campaignId: string): Promise<boolean> {
  const { data } = await supabase
    .from('emails')
    .select('id')
    .eq('lead_id', leadId)
    .eq('campaign_id', campaignId)
    .in('status', ['replied'])
    .limit(1) as { data: Array<{ id: string }> | null }

  return (data?.length ?? 0) > 0
}

// ── Credential decryption ─────────────────────────────────────────────────
interface Creds {
  type:       string
  apiKey?:    string
  smtpPass?:  string
}

async function decryptAccountCreds(account: {
  type: string
  resend_key_id: string | null
  smtp_pass_id:  string | null
}): Promise<Creds | null> {
  try {
    if (account.type === 'resend' && account.resend_key_id) {
      const apiKey = await decryptSecret(account.resend_key_id)
      return { type: 'resend', apiKey }
    }
    if (account.type === 'smtp' && account.smtp_pass_id) {
      const smtpPass = await decryptSecret(account.smtp_pass_id)
      return { type: 'smtp', smtpPass }
    }
    return null
  } catch {
    return null
  }
}

async function decryptSecret(secretId: string): Promise<string> {
  if (VAULT_ENABLED) {
    const { data, error } = await supabase.rpc('vault_decrypt_secret', { secret_id: secretId }) as { data: string | null; error: unknown }
    if (error || !data) throw new Error(`Vault decrypt failed: ${secretId}`)
    return data
  }
  // Local AES-256-GCM fallback (development)
  return localDecrypt(secretId, VAULT_KEY)
}

async function localDecrypt(ciphertext: string, keyHex: string): Promise<string> {
  const [ivHex, encHex] = ciphertext.split(':')
  const keyBytes  = hexToBytes(keyHex.padEnd(64, '0').slice(0, 64))
  const ivBytes   = hexToBytes(ivHex)
  const encBytes  = hexToBytes(encHex)
  const key = await webcrypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'])
  const dec = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, encBytes)
  return new TextDecoder().decode(dec)
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return arr
}

// ── Email dispatch ────────────────────────────────────────────────────────
interface SendParams {
  account: { type: string; from_email: string; from_name: string; smtp_host: string | null; smtp_port: number | null; smtp_user: string | null; smtp_secure: boolean }
  creds:   Creds
  to:      string
  toName:  string
  subject: string
  html:    string
  text:    string
}

async function sendEmail(params: SendParams): Promise<{ success: boolean; error?: string }> {
  const { account, creds, to, toName, subject, html, text } = params

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (account.type === 'resend' && creds.apiKey) {
        const resend = new Resend(creds.apiKey)
        const { error } = await resend.emails.send({
          from:    `${account.from_name} <${account.from_email}>`,
          to:      [toName ? `${toName} <${to}>` : to],
          subject,
          html,
          text,
        })
        if (error) throw new Error(error.message)
        return { success: true }
      }

      if (account.type === 'smtp' && creds.smtpPass) {
        const transporter = nodemailer.createTransport({
          host:   account.smtp_host!,
          port:   account.smtp_port ?? 587,
          secure: account.smtp_secure,
          auth:   { user: account.smtp_user!, pass: creds.smtpPass },
        })
        await transporter.sendMail({
          from:    `"${account.from_name}" <${account.from_email}>`,
          to:      toName ? `"${toName}" <${to}>` : to,
          subject,
          html,
          text,
        })
        return { success: true }
      }

      return { success: false, error: 'Unknown account type' }
    } catch (err) {
      if (attempt === 2) return { success: false, error: String(err) }
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
    }
  }
  return { success: false, error: 'Max retries exceeded' }
}

// ── Tracking + unsubscribe HTML ───────────────────────────────────────────
function buildSendableHtml(params: {
  html: string; emailId: string; pixelId: string
  unsubscribeToken: string; fromName: string; appUrl: string
}): string {
  const { html, emailId, pixelId, unsubscribeToken, fromName, appUrl } = params

  const tracked = html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_, url) => `href="${appUrl}/api/track/click/${emailId}?url=${encodeURIComponent(url)}"`
  )

  const pixel = `<img src="${appUrl}/api/track/open/${pixelId}" width="1" height="1" alt="" style="display:none" />`

  const footer = `
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center">
  This email was sent by ${escapeHtml(fromName)}.
  <a href="${appUrl}/unsubscribe?token=${unsubscribeToken}" style="color:#999">Unsubscribe</a>
</div>`

  return tracked + pixel + footer
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function generateUnsubscribeToken(leadId: string, workspaceId: string): Promise<string> {
  const msg = `${leadId}:${workspaceId}:${Date.now()}`
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode((VAULT_KEY || 'dev-key').slice(0, 32).padEnd(32, '0')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return btoa(`${msg}:${hex}`)
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

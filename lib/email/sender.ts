/**
 * lib/email/sender.ts
 *
 * The actual email dispatch layer — supports both Resend and SMTP (nodemailer).
 * This module is server-only (Node.js runtime).
 *
 * Flow for each send:
 *   1. Retrieve decrypted credentials from Vault
 *   2. Choose transport (Resend SDK or nodemailer)
 *   3. Send with retry (up to 3 attempts, 1s backoff)
 *   4. Return provider message ID for tracking
 */

import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { retrieveSecret } from './vault'

export interface SendParams {
  to:          string
  from_email:  string
  from_name:   string
  reply_to?:   string
  subject:     string
  html:        string
  text?:       string
  headers?:    Record<string, string>
}

export interface SendResult {
  success:    boolean
  message_id: string | null
  error?:     string
}

const MAX_RETRIES     = 3
const RETRY_DELAY_MS  = 1000

// ── Resend ────────────────────────────────────────────────────────────────
async function sendViaResend(
  apiKey: string,
  params: SendParams,
): Promise<SendResult> {
  const resend = new Resend(apiKey)
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await resend.emails.send({
        from:     `${params.from_name} <${params.from_email}>`,
        to:       [params.to],
        replyTo:  params.reply_to,
        subject:  params.subject,
        html:     params.html,
        text:     params.text,
        headers:  params.headers,
      })
      if (error) throw new Error(error.message)
      return { success: true, message_id: data?.id ?? null }
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        return { success: false, message_id: null, error: String(err) }
      }
      await delay(RETRY_DELAY_MS * attempt)
    }
  }
  return { success: false, message_id: null, error: 'Max retries exceeded' }
}

// ── SMTP (nodemailer) ─────────────────────────────────────────────────────
async function sendViaSMTP(
  config: {
    host:    string
    port:    number
    user:    string
    pass:    string
    secure:  boolean
  },
  params: SendParams,
): Promise<SendResult> {
  const transport = nodemailer.createTransport({
    host:   config.host,
    port:   config.port,
    secure: config.secure,
    auth:   { user: config.user, pass: config.pass },
    // 10s connection timeout
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     30_000,
  })

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const info = await transport.sendMail({
        from:    `"${params.from_name}" <${params.from_email}>`,
        to:      params.to,
        replyTo: params.reply_to,
        subject: params.subject,
        html:    params.html,
        text:    params.text,
        headers: params.headers,
      })
      return { success: true, message_id: info.messageId ?? null }
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        return { success: false, message_id: null, error: String(err) }
      }
      await delay(RETRY_DELAY_MS * attempt)
    } finally {
      transport.close?.()
    }
  }
  return { success: false, message_id: null, error: 'Max retries exceeded' }
}

// ── Unified dispatcher ────────────────────────────────────────────────────
/**
 * Dispatch an email using a sending account record.
 * Credentials are fetched from Vault on demand.
 */
export async function dispatchEmail(
  supabase: SupabaseClient,
  account: {
    id:            string
    type:          'resend' | 'smtp'
    from_email:    string
    from_name:     string
    resend_key_id: string | null
    smtp_host:     string | null
    smtp_port:     number | null
    smtp_user:     string | null
    smtp_pass_id:  string | null
    smtp_secure:   boolean
  },
  params: SendParams,
): Promise<SendResult> {
  if (account.type === 'resend') {
    if (!account.resend_key_id) {
      return { success: false, message_id: null, error: 'Resend API key not configured' }
    }
    const apiKey = await retrieveSecret(account.resend_key_id)
    return sendViaResend(apiKey, params)
  }

  // SMTP
  if (!account.smtp_host || !account.smtp_user || !account.smtp_pass_id) {
    return { success: false, message_id: null, error: 'SMTP credentials incomplete' }
  }
  const pass = await retrieveSecret(account.smtp_pass_id)
  return sendViaSMTP(
    {
      host:   account.smtp_host,
      port:   account.smtp_port ?? 587,
      user:   account.smtp_user,
      pass,
      secure: account.smtp_secure,
    },
    params,
  )
}

/**
 * Validate sending account credentials by attempting a connection / API call.
 * For Resend: list domains (fast, read-only).
 * For SMTP: verify connection.
 */
export async function testSendingAccount(
  account: {
    type:          'resend' | 'smtp'
    from_email:    string
    from_name:     string
    resend_key_id: string | null
    smtp_host:     string | null
    smtp_port:     number | null
    smtp_user:     string | null
    smtp_pass_id:  string | null
    smtp_secure:   boolean
  },
  testRecipient: string,
): Promise<{ success: boolean; error?: string }> {
  if (account.type === 'resend') {
    if (!account.resend_key_id) return { success: false, error: 'No API key stored' }
    const apiKey = await retrieveSecret(account.resend_key_id)
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from:    `${account.from_name} <${account.from_email}>`,
      to:      [testRecipient],
      subject: 'Test email from Summits CRM',
      html:    '<p>This is a test email to verify your sending account is connected correctly.</p>',
    })
    if (error) return { success: false, error: error.message }
    return { success: true }
  }

  // SMTP verify
  if (!account.smtp_host || !account.smtp_user || !account.smtp_pass_id) {
    return { success: false, error: 'SMTP credentials incomplete' }
  }
  const pass = await retrieveSecret(account.smtp_pass_id)
  const transport = nodemailer.createTransport({
    host:   account.smtp_host,
    port:   account.smtp_port ?? 587,
    secure: account.smtp_secure,
    auth:   { user: account.smtp_user, pass },
    connectionTimeout: 10_000,
  })
  try {
    await transport.verify()
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  } finally {
    transport.close?.()
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

/**
 * GET /api/track/click/[emailId]?url=https://original-url.com
 *
 * Click-tracking redirect endpoint.
 * - Records the click event in the background
 * - Immediately 302 redirects to the original URL
 * - Validates the target URL is a real HTTP/HTTPS URL before redirecting
 *
 * Public endpoint — no auth required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ emailId: string }> }

// Allowed URL schemes (block javascript: etc.)
const SAFE_PROTOCOLS = new Set(['http:', 'https:'])

export async function GET(req: NextRequest, { params }: Params) {
  const { emailId } = await params
  const targetUrl   = req.nextUrl.searchParams.get('url')

  // Validate redirect target
  let safeUrl: string
  try {
    const parsed = new URL(targetUrl ?? '')
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) throw new Error('Unsafe protocol')
    safeUrl = parsed.toString()
  } catch {
    return NextResponse.redirect(new URL('/', req.url), { status: 302 })
  }

  // Track async, redirect immediately
  trackClick(emailId, safeUrl).catch((err) => console.error('[track/click]', err))

  return NextResponse.redirect(safeUrl, { status: 302 })
}

async function trackClick(emailId: string, url: string): Promise<void> {
  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const { data: email } = await adminClient
    .from('emails')
    .select('id, lead_id, workspace_id, status')
    .eq('id', emailId)
    .single() as {
      data: { id: string; lead_id: string; workspace_id: string; status: string } | null
      error: unknown
    }

  if (!email) return

  // Upgrade status to 'clicked' (only if not already replied/bounced)
  if (['queued', 'sending', 'sent', 'opened'].includes(email.status)) {
    await adminClient
      .from('emails')
      .update({ status: 'clicked', clicked_at: now })
      .eq('id', emailId)
  }

  await adminClient.from('activity_logs').insert({
    workspace_id: email.workspace_id,
    lead_id:      email.lead_id,
    user_id:      null,
    type:         'email_clicked',
    metadata:     { email_id: emailId, url },
  })
}

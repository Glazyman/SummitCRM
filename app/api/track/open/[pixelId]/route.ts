/**
 * GET /api/track/open/[pixelId]
 *
 * Open-tracking endpoint.
 * Returns a 1×1 transparent GIF immediately (no caching),
 * then records the open event in the background.
 *
 * Public endpoint — no auth required.
 * Rate limiting is applied at the platform/CDN level.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Smallest valid transparent GIF (35 bytes)
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

type Params = { params: Promise<{ pixelId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { pixelId } = await params

  // Return pixel immediately — track asynchronously
  trackOpen(pixelId).catch((err) => console.error('[track/open]', err))

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type':  'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma':        'no-cache',
      'Expires':       '0',
    },
  })
}

async function trackOpen(pixelId: string): Promise<void> {
  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  // Find email by tracking pixel ID
  const { data: email } = await adminClient
    .from('emails')
    .select('id, lead_id, workspace_id, status, sent_by')
    .eq('tracking_pixel_id', pixelId)
    .single() as {
      data: { id: string; lead_id: string; workspace_id: string; status: string; sent_by: string | null } | null
      error: unknown
    }

  if (!email) return

  // Only update if not already beyond 'opened'
  if (['queued', 'sending', 'sent'].includes(email.status)) {
    await adminClient
      .from('emails')
      .update({ status: 'opened', opened_at: now })
      .eq('id', email.id)
  } else if (email.status === 'opened') {
    // Already opened, just record another open event but don't downgrade status
    return
  }

  // Log activity (only on first open)
  await adminClient.from('activity_logs').insert({
    workspace_id: email.workspace_id,
    lead_id:      email.lead_id,
    user_id:      null,
    type:         'email_opened',
    metadata:     { email_id: email.id },
  }).then(({ error }) => {
    if (error) console.error('[track/open activity log]', error)
  })
}

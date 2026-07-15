import { NextResponse, type NextRequest } from 'next/server'
import { getActor } from '@/lib/auth/actor'
import { fetchQueue } from '@/lib/call-mode/queue'
import { parseBatchId, parseQueuePreset } from '@/lib/call-mode/types'

/**
 * GET /api/call-mode/queue?queue=fresh|retry|all&batch=<uuid>
 *
 * Builds the Call Mode queue. Called when the rep presses "Start calling" —
 * the /call-mode page itself only fetches the match COUNT, so the setup screen
 * paints without waiting on (or shipping) thousands of lead rows.
 *
 * Scoping is delegated to fetchQueue(), which derives rep scoping from the
 * EFFECTIVE actor — a rep only ever gets their assigned leads and no batch
 * filter, and an admin viewing-as a rep gets exactly the rep's queue.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const actor = await getActor()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const queue = parseQueuePreset(sp.get('queue'))
  const batchId = parseBatchId(sp.get('batch'))

  const result = await fetchQueue(actor, queue, batchId)
  if (!result) {
    return NextResponse.json({ error: 'Failed to build queue' }, { status: 500 })
  }

  return NextResponse.json(result)
}

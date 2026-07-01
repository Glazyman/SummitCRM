import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor } from '@/lib/auth/actor'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* eslint-disable @typescript-eslint/no-explicit-any */

// PATCH /api/call-sessions/[id] — update running tallies / finalize a session.
// Only the session owner may write. Pass { ended: true } to stamp ended_at.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })

  // Effective actor: a session owned by the impersonated rep is finalized by
  // the admin viewing-as them (owner check uses the effective id).
  const actor = await getActor()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient() as any
  // Owner check — the session must exist and belong to the caller.
  const { data: session } = await admin
    .from('call_sessions')
    .select('id, user_id')
    .eq('id', id)
    .single()
  if (!session || session.user_id !== actor.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (Number.isFinite(body?.calls_logged)) patch.calls_logged = Math.max(0, Math.trunc(body.calls_logged))
  if (Number.isFinite(body?.skipped))      patch.skipped      = Math.max(0, Math.trunc(body.skipped))
  if (body?.outcomes && typeof body.outcomes === 'object') patch.outcomes = body.outcomes
  if (body?.ended === true) patch.ended_at = new Date().toISOString()

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await admin.from('call_sessions').update(patch).eq('id', id)
  if (error) {
    console.error('[PATCH /api/call-sessions/[id]]', error)
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

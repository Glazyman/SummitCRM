import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor } from '@/lib/auth/actor'
import { getUsersById } from '@/lib/users'

const PRESETS = new Set(['fresh', 'retry', 'all'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/call-sessions — list Call Mode sessions.
// Reps see their own; admins/managers see the whole workspace (optionally
// filtered to one rep via ?userId=). Returns sessions + a userId→name map.
export async function GET(req: NextRequest) {
  // Effective actor: a session started while an admin is "viewing as" a rep is
  // owned by (and listed for) the rep — same as if the rep ran it.
  const actor = await getActor()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient() as any
  const member = { workspace_id: actor.workspaceId, role: actor.role }
  const user = { id: actor.userId }

  const canSeeAll = ['admin', 'super_admin', 'manager'].includes(member.role)
  const filterUser = req.nextUrl.searchParams.get('userId')

  let query = admin
    .from('call_sessions')
    .select('id, user_id, queue_preset, batch_id, queue_size, calls_logged, skipped, outcomes, started_at, ended_at')
    .eq('workspace_id', member.workspace_id)
    .order('started_at', { ascending: false })
    .limit(200)

  if (!canSeeAll) {
    query = query.eq('user_id', user.id)             // reps: own only
  } else if (filterUser && UUID_RE.test(filterUser)) {
    query = query.eq('user_id', filterUser)
  }

  const { data, error } = await query
  if (error) {
    console.error('[GET /api/call-sessions]', error)
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 })
  }

  const sessions = (data ?? []) as Array<{ user_id: string }>
  const ids = [...new Set(sessions.map((s) => s.user_id))]
  const nameById = await getUsersById(admin, member.workspace_id, ids)
  const names: Record<string, string> = {}
  ids.forEach((id) => { names[id] = nameById.get(id) ?? 'Unknown' })

  return NextResponse.json({ sessions, names, canSeeAll })
}

// POST /api/call-sessions — start a session (one per "Start calling").
// Always owned by the caller (user_id = auth.uid()).
export async function POST(req: NextRequest) {
  // Effective actor: a session started while an admin is "viewing as" a rep is
  // owned by (and listed for) the rep — same as if the rep ran it.
  const actor = await getActor()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient() as any
  const member = { workspace_id: actor.workspaceId, role: actor.role }
  const user = { id: actor.userId }

  const body = await req.json().catch(() => ({}))
  const preset = PRESETS.has(body?.queue_preset) ? body.queue_preset : null
  const batchId = typeof body?.batch_id === 'string' && UUID_RE.test(body.batch_id) ? body.batch_id : null
  const queueSize = Number.isFinite(body?.queue_size) ? Math.max(0, Math.trunc(body.queue_size)) : 0

  const { data, error } = await admin
    .from('call_sessions')
    .insert({
      workspace_id: member.workspace_id,
      user_id:      user.id,
      queue_preset: preset,
      batch_id:     batchId,
      queue_size:   queueSize,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[POST /api/call-sessions]', error)
    return NextResponse.json({ error: 'Failed to start session' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

const DEFAULT_DAILY_TARGET = 100

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < 1 || value > 10000) return null
  return value
}

async function getAdminContext() {
  const cookieStore = await cookies()
  const supabase = await createServerClient(cookieStore)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const admin = createAdminClient()
  const { data: member } = await admin
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: string } | null }

  if (!member || !['admin', 'super_admin'].includes(member.role)) return null
  return { admin, member }
}

export async function GET() {
  try {
    const ctx = await getAdminContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { admin, member } = ctx

    const [wsRes, overridesRes, membersRes] = await Promise.all([
      admin
        .from('workspaces')
        .select('settings')
        .eq('id', member.workspace_id)
        .single(),

      admin
        .from('rep_call_targets')
        .select('user_id, daily_target')
        .eq('workspace_id', member.workspace_id),

      admin
        .from('workspace_members')
        .select('user_id, role, is_active')
        .eq('workspace_id', member.workspace_id)
        .eq('is_active', true),
    ])

    const ws = wsRes.data as { settings?: Record<string, unknown> } | null
    const overrides = (overridesRes.data ?? []) as Array<{ user_id: string; daily_target: number }>
    const members = (membersRes.data ?? []) as Array<{
      user_id: string
      role: string
      is_active: boolean
    }>

    const workspaceDefault = Number(ws?.settings?.daily_call_target)
    const defaultDailyTarget = Number.isFinite(workspaceDefault) && workspaceDefault > 0
      ? Math.floor(workspaceDefault)
      : DEFAULT_DAILY_TARGET

    const overrideByUser = new Map(overrides.map((r) => [r.user_id, r.daily_target]))

    const { data: usersData } = await admin.auth.admin.listUsers()
    const usersById = new Map(
      (usersData.users ?? []).map((u) => [
        u.id,
        {
          email: u.email ?? null,
          meta: (u.user_metadata ?? {}) as Record<string, unknown>,
        },
      ])
    )

    const reps = members
      .filter((m) => m.role === 'rep')
      .map((m) => {
        const userRow = usersById.get(m.user_id)
        const meta = userRow?.meta ?? {}
        const fullName = (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? null
        const override = overrideByUser.get(m.user_id) ?? null
        return {
          user_id: m.user_id,
          full_name: fullName,
          email: userRow?.email ?? null,
          override_daily_target: override,
          effective_daily_target: override ?? defaultDailyTarget,
        }
      })

    return NextResponse.json({
      workspace_default_daily_target: defaultDailyTarget,
      reps,
    })
  } catch (err) {
    console.error('[GET /api/admin/call-targets]', err)
    return NextResponse.json({ error: 'Failed to load call targets' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAdminContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { admin, member } = ctx
    const body = await req.json().catch(() => ({})) as {
      workspace_default_daily_target?: unknown
      overrides?: Array<{ user_id: string; daily_target: number | null }>
    }

    if (body.workspace_default_daily_target !== undefined) {
      const nextDefault = parsePositiveInt(body.workspace_default_daily_target)
      if (!nextDefault) {
        return NextResponse.json({ error: 'workspace_default_daily_target must be an integer between 1 and 10000' }, { status: 422 })
      }

      const wsRes = await admin
        .from('workspaces')
        .select('settings')
        .eq('id', member.workspace_id)
        .single()

      const ws = wsRes.data as { settings?: Record<string, unknown> } | null
      const nextSettings = { ...(ws?.settings ?? {}), daily_call_target: nextDefault }
      const updateDefaultRes = await admin
        .from('workspaces')
        .update({ settings: nextSettings })
        .eq('id', member.workspace_id)
      if (updateDefaultRes.error) {
        return NextResponse.json({ error: updateDefaultRes.error.message }, { status: 500 })
      }
    }

    if (body.overrides !== undefined) {
      if (!Array.isArray(body.overrides)) {
        return NextResponse.json({ error: 'overrides must be an array' }, { status: 422 })
      }

      const repMembersRes = await admin
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', member.workspace_id)
        .eq('is_active', true)

      const repMembers = (repMembersRes.data ?? []) as Array<{ user_id: string; role: string }>

      const repIds = new Set(repMembers.filter((m) => m.role === 'rep').map((m) => m.user_id))

      for (const item of body.overrides) {
        if (!item || typeof item.user_id !== 'string' || !repIds.has(item.user_id)) {
          return NextResponse.json({ error: 'All override user_id values must be active reps in this workspace' }, { status: 422 })
        }
        if (item.daily_target === null) {
          const deleteRes = await admin
            .from('rep_call_targets')
            .delete()
            .eq('workspace_id', member.workspace_id)
            .eq('user_id', item.user_id)
          if (deleteRes.error) {
            return NextResponse.json({ error: deleteRes.error.message }, { status: 500 })
          }
          continue
        }

        const parsed = parsePositiveInt(item.daily_target)
        if (!parsed) {
          return NextResponse.json({ error: 'override daily_target must be an integer between 1 and 10000 or null' }, { status: 422 })
        }

        const upsertRes = await admin
          .from('rep_call_targets')
          .upsert({
            workspace_id: member.workspace_id,
            user_id: item.user_id,
            daily_target: parsed,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'workspace_id,user_id' })
        if (upsertRes.error) {
          return NextResponse.json({ error: upsertRes.error.message }, { status: 500 })
        }
      }
    }

    if (body.workspace_default_daily_target === undefined && body.overrides === undefined) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PATCH /api/admin/call-targets]', err)
    return NextResponse.json({ error: 'Failed to update call targets' }, { status: 500 })
  }
}

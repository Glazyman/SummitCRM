import { createAdminClient } from '@/lib/supabase/server'
import { selectAll } from '@/lib/supabase/select-all'

/** Resolve a small event-based cohort first, then apply the table filters before pagination. */
export async function interestedLeadsPage(
  admin: ReturnType<typeof createAdminClient>, workspaceId: string, viewerId: string,
  scopeToRep: boolean, param: (key: string) => string | undefined, limit: number, offset: number,
) {
  const start = param('interested_start')!
  const end = param('interested_end')!
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end))
    throw new Error('Invalid interest date range')
  const marks = await selectAll<{ lead_id: string | null }>((from, to) =>
    admin.from('activity_logs').select('lead_id').eq('workspace_id', workspaceId)
      .eq('type', 'interest_status_changed').eq('metadata->>to', 'interested')
      .gte('created_at', start).lt('created_at', end).order('id').range(from, to))
  const ids = [...new Set(marks.flatMap(m => m.lead_id ? [m.lead_id] : []))]
  const rows: Record<string, any>[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  // Keep URL/query size bounded, and never rely on the 1000-row REST default.
  for (let i = 0; i < ids.length; i += 100) {
    let query = admin.from('leads').select('*').eq('workspace_id', workspaceId)
      .is('deleted_at', null).in('id', ids.slice(i, i + 100))
    if (scopeToRep || param('my') === '1') query = query.eq('assigned_to', viewerId)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data ?? []))
  }
  const interests = param('interest')?.split(',').filter(Boolean) ?? []
  const statuses = param('status')?.split(',').filter(Boolean) ?? []
  const tokens = (param('q') ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = rows.filter(l => {
    if (interests.length && !interests.includes(l.interest_status)) return false
    if (param('batch') && l.batch_id !== param('batch')) return false
    if (param('assigned') === 'unassigned' ? l.assigned_to !== null : param('assigned') && l.assigned_to !== param('assigned')) return false
    if (param('from') && Date.parse(l.created_at) < Date.parse(param('from')!)) return false
    if (param('to') && Date.parse(l.created_at) >= Date.parse(param('to')!) + 86400000) return false
    if (param('cold') === '1' && !(l.interest_status === 'pending' && Date.parse(l.created_at) < Date.now() - 7 * 86400000 && (!l.last_contacted_at || ['voicemail', 'no_answer'].includes(l.last_call_outcome)))) return false
    const text = [l.first_name, l.last_name, l.email, l.company, l.title].join(' ').toLowerCase()
    return tokens.every(t => text.includes(t))
  })
  const status_counts: Record<string, number> = {}
  for (const l of filtered) status_counts[l.status] = (status_counts[l.status] ?? 0) + 1
  const matching = filtered.filter(l => !statuses.length || statuses.includes(l.status))
  const allowed = ['name', 'email', 'company', 'status', 'created_at', 'last_activity_at']
  const sort = allowed.includes(param('sort') ?? '') ? param('sort')! : 'last_activity_at'
  const direction = param('dir') === 'asc' ? 1 : -1
  const value = (l: typeof matching[number]) => sort === 'name' ? [l.first_name, l.last_name].join(' ').toLowerCase() : l[sort]?.toLowerCase()
  matching.sort((a, b) => {
    const av = value(a), bv = value(b)
    if (av == null || bv == null) return av == bv ? a.id.localeCompare(b.id) : av == null ? 1 : -1
    return av.localeCompare(bv) * direction || a.id.localeCompare(b.id)
  })
  return { data: { rows: matching.slice(offset, offset + limit), total_count: matching.length, status_counts }, matchingIds: matching.map(l => l.id) }
}

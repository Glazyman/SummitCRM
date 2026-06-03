/**
 * Fetch tags for a set of leads in one query.
 *
 * Returns a Map of lead_id → tags[]. Used to decorate pipeline cards (and any
 * other list of leads) with their tags without an N+1 query. Pass a
 * service-role admin client so RLS doesn't filter the join.
 */

export type LeadTag = { id: string; name: string; color: string }

export async function getTagsByLeadIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  leadIds: string[],
): Promise<Map<string, LeadTag[]>> {
  const map = new Map<string, LeadTag[]>()
  if (leadIds.length === 0) return map

  const { data } = await client
    .from('lead_tags')
    .select('lead_id, tags(id, name, color)')
    .in('lead_id', leadIds)

  for (const row of (data ?? []) as Array<{ lead_id: string; tags: LeadTag | LeadTag[] | null }>) {
    const tags = Array.isArray(row.tags) ? row.tags : row.tags ? [row.tags] : []
    if (tags.length === 0) continue
    const existing = map.get(row.lead_id) ?? []
    existing.push(...tags)
    map.set(row.lead_id, existing)
  }
  return map
}

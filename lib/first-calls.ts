/** One first recorded call per lead (or per rep/lead), before date filtering. */
export function firstCalls<T extends { lead_id: string | null; called_at: string; logged_by?: string | null; id?: string }>(rows: T[], perRep = false): T[] {
  const first = new Map<string, T>()
  for (const row of rows) {
    if (!row.lead_id) continue
    const key = perRep ? `${row.logged_by ?? ''}:${row.lead_id}` : row.lead_id
    const previous = first.get(key)
    if (!previous || Date.parse(row.called_at) < Date.parse(previous.called_at) ||
      (row.called_at === previous.called_at && (row.id ?? '') < (previous.id ?? ''))) first.set(key, row)
  }
  return [...first.values()]
}
export function inCallPeriod<T extends { called_at: string }>(rows: T[], start: string, end: string): T[] {
  return rows.filter(row => Date.parse(row.called_at) >= Date.parse(start) && Date.parse(row.called_at) < Date.parse(end))
}

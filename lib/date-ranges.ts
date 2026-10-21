import type { DateRangePreset } from '@/components/admin/types'

export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** End is exclusive. Rolling presets use calendar dates including today. */
export function resolveDateRange(preset: DateRangePreset, day: string, from = '', through = '', now = new Date()) {
  const start = new Date(now)
  const end = new Date(now)
  end.setHours(24, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  if (preset === 'all') start.setTime(0)
  else if (preset === '7d') start.setDate(start.getDate() - 6)
  else if (preset === '30d') start.setDate(start.getDate() - 29)
  else if (preset === 'day' || preset === 'custom') {
    const first = preset === 'day' ? day : from
    const last = preset === 'day' ? day : through
    if (/^\d{4}-\d{2}-\d{2}$/.test(first) && /^\d{4}-\d{2}-\d{2}$/.test(last)) {
      const a = new Date(first + 'T00:00:00'), b = new Date(last + 'T00:00:00')
      if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && a <= b) {
        b.setDate(b.getDate() + 1)
        return { start: a.toISOString(), end: b.toISOString() }
      }
    }
  }
  return { start: start.toISOString(), end: end.toISOString() }
}

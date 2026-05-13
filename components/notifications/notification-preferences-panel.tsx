'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACTIVE_NOTIFICATION_TYPES, NOTIFICATION_META } from './types'
import type { NotificationPreference, NotificationType } from './types'

// Only types the product actually emits. Anything in here gets a toggle.
const ALL_TYPES: NotificationType[] = ACTIVE_NOTIFICATION_TYPES

/** Build a full preferences array from API response — fills defaults for any missing type */
function normPrefs(raw: NotificationPreference[]): NotificationPreference[] {
  return ALL_TYPES.map((type) => {
    const existing = raw.find((p) => p.type === type)
    return existing ?? { type, in_app: true }
  })
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex w-10 h-5 rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span className={cn(
        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
        checked && 'translate-x-5'
      )} />
    </button>
  )
}

export function NotificationPreferencesPanel() {
  const [prefs,   setPrefs]   = useState<NotificationPreference[]>(() => normPrefs([]))
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load preferences')
        return r.json()
      })
      .then((d) => {
        setPrefs(normPrefs(d.preferences ?? []))
        setLoading(false)
      })
      .catch(() => {
        // Keep defaults on error so the UI is usable
        setLoading(false)
      })
  }, [])

  const update = (type: NotificationType, field: 'in_app', value: boolean) => {
    setPrefs((prev) =>
      prev.map((p) => (p.type === type ? { ...p, [field]: value } : p))
    )
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/notifications/preferences', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(prefs),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? 'Failed to save preferences')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm">Notification Preferences</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Turn off any kind of in-app notification you don't want to see.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            saved
              ? 'bg-primary text-primary-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
            saving && 'opacity-70 cursor-not-allowed'
          )}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        {ALL_TYPES.map((type, i) => {
          const meta = NOTIFICATION_META[type]
          const pref = prefs.find((p) => p.type === type) ?? { type, in_app: true }
          return (
            <div
              key={type}
              className={cn(
                'flex items-center justify-between gap-4 px-4 py-3',
                i < ALL_TYPES.length - 1 && 'border-b'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={cn(
                  'w-7 h-7 rounded-md flex items-center justify-center text-sm flex-shrink-0',
                  meta.bgColor, meta.color
                )}>
                  {meta.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{meta.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
                </div>
              </div>
              <Toggle
                checked={pref.in_app}
                onChange={(v) => update(type, 'in_app', v)}
                label={`Toggle ${meta.label}`}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

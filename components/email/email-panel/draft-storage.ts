/**
 * Client-side draft management using localStorage.
 * Drafts are keyed by lead ID + workspace ID.
 * Auto-save every 3 seconds while the user is typing.
 *
 * In production this would be persisted to the `email_drafts` table in Supabase,
 * but localStorage is used here for offline-first UX without requiring a DB call.
 */

import type { EmailDraft } from './types'

const STORAGE_KEY = 'summits_email_drafts'
const MAX_DRAFTS_PER_LEAD = 10

// ── Read all drafts ───────────────────────────────────────────────────────
function readAll(): EmailDraft[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as EmailDraft[]) : []
  } catch {
    return []
  }
}

function writeAll(drafts: EmailDraft[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts))
}

// ── Get drafts for a specific lead ────────────────────────────────────────
export function getDraftsForLead(leadId: string): EmailDraft[] {
  return readAll()
    .filter((d) => d.lead_id === leadId)
    .sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime())
}

// ── Save / upsert a draft ─────────────────────────────────────────────────
export function saveDraft(draft: Omit<EmailDraft, 'id' | 'saved_at'> & { id?: string }): EmailDraft {
  const all = readAll()
  const now = new Date().toISOString()

  const saved: EmailDraft = {
    id:      draft.id ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label:   draft.subject?.slice(0, 60) || 'Untitled draft',
    saved_at:now,
    ...draft,
  }

  const withoutOld = all.filter((d) => d.id !== saved.id)
  const leadDrafts = withoutOld.filter((d) => d.lead_id === saved.lead_id)

  // Enforce per-lead cap
  const trimmed = leadDrafts.length >= MAX_DRAFTS_PER_LEAD
    ? leadDrafts.slice(0, MAX_DRAFTS_PER_LEAD - 1)
    : leadDrafts

  const otherDrafts = withoutOld.filter((d) => d.lead_id !== saved.lead_id)
  writeAll([saved, ...trimmed, ...otherDrafts])
  return saved
}

// ── Delete a draft ────────────────────────────────────────────────────────
export function deleteDraft(draftId: string): void {
  writeAll(readAll().filter((d) => d.id !== draftId))
}

// ── Get a single draft by ID ──────────────────────────────────────────────
export function getDraft(draftId: string): EmailDraft | null {
  return readAll().find((d) => d.id === draftId) ?? null
}

// ── Auto-save hook helper: returns a debounced save fn ───────────────────
export function createAutoSaver(
  leadId:    string,
  draftIdRef: { current: string | null },
  onSaved:   (draft: EmailDraft) => void,
  delayMs    = 3000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined

  return function scheduleAutoSave(
    accountId: string,
    subject:   string,
    body:      string,
  ) {
    clearTimeout(timer)
    if (!subject.trim() && !body.trim()) return   // nothing to save
    timer = setTimeout(() => {
      const saved = saveDraft({
        id:                 draftIdRef.current ?? undefined,
        lead_id:            leadId,
        sending_account_id: accountId,
        subject,
        body,
      })
      draftIdRef.current = saved.id
      onSaved(saved)
    }, delayMs)
  }
}

// ── Format relative time ──────────────────────────────────────────────────
export function formatDraftAge(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

'use client'

import * as React from 'react'
import {
  Mail, Phone, Building2, Globe, MapPin,
  Package, UserRound, Sparkles,
  Pencil, Check, X, ExternalLink, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { STATUS_CONFIG, ALL_STATUSES, INTEREST_CONFIG, ALL_INTEREST_STATUSES } from '@/components/leads/status-config'
import type { LeadDetail, TeamMember, LeadStatus, InterestStatus } from './types'

interface LeadProfileCardProps {
  lead:               LeadDetail
  teamMembers:        TeamMember[]
  onSave:             (patch: Partial<LeadDetail>) => Promise<void>
  /** When set, user can rename the linked batch (updates all leads in that batch). */
  onRenameBatch?:     (name: string) => Promise<void>
  canEditBatch?:      boolean
  onStatusChange?:    (status: LeadStatus) => void
  onInterestChange?:  (status: InterestStatus) => void
}

type EditableField =
  | 'first_name' | 'last_name' | 'email' | 'phone'
  | 'title' | 'company' | 'website' | 'linkedin_url'

const FIELD_LABELS: Record<EditableField, string> = {
  first_name:  'First Name',
  last_name:   'Last Name',
  email:       'Email',
  phone:       'Phone',
  title:       'Job Title',
  company:     'Company',
  website:     'Website',
  linkedin_url:'LinkedIn',
}

export function LeadProfileCard({
  lead,
  teamMembers,
  onSave,
  onRenameBatch,
  canEditBatch = true,
  onStatusChange,
  onInterestChange,
}: LeadProfileCardProps) {
  const [editing, setEditing]     = React.useState(false)
  const [saving,  setSaving]      = React.useState(false)
  const [draft,   setDraft]       = React.useState<Partial<LeadDetail>>({})
  const [batchEditing, setBatchEditing] = React.useState(false)
  const [batchDraft, setBatchDraft]     = React.useState('')
  const [batchSaving, setBatchSaving]   = React.useState(false)

  const name         = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'
  const initials     = [lead.first_name?.[0], lead.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'
  const statusMeta   = STATUS_CONFIG[lead.status]
  const interestMeta = lead.interest_status ? INTEREST_CONFIG[lead.interest_status as InterestStatus] : null

  function startEdit() {
    setDraft({
      first_name:  lead.first_name  ?? '',
      last_name:   lead.last_name   ?? '',
      email:       lead.email,
      phone:       lead.phone       ?? '',
      title:       lead.title       ?? '',
      company:     lead.company     ?? '',
      website:     lead.website     ?? '',
      linkedin_url:lead.linkedin_url ?? '',
    })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft({})
  }

  async function handleSave() {
    if (!draft.email?.trim()) return
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
      setDraft({})
    } finally {
      setSaving(false)
    }
  }

  const get = (f: EditableField): string =>
    editing ? (draft[f] as string ?? '') : ((lead[f] as string | null) ?? '')

  const set = (f: EditableField, v: string) =>
    setDraft((d) => ({ ...d, [f]: v }))

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">

      {/* ── Avatar + name header ── */}
      <div className="relative border-b border-border bg-secondary/50 px-5 pb-4 pt-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-lg font-bold text-foreground">
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex gap-2">
                <input
                  value={draft.first_name as string ?? ''}
                  onChange={(e) => set('first_name', e.target.value)}
                  placeholder="First name"
                  className="h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  value={draft.last_name as string ?? ''}
                  onChange={(e) => set('last_name', e.target.value)}
                  placeholder="Last name"
                  className="h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ) : (
              <p className="font-semibold leading-tight">{name}</p>
            )}

            {editing ? (
              <input
                value={draft.title as string ?? ''}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Job title"
                className="mt-1.5 h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              lead.title && (
                <p className="mt-0.5 text-sm text-muted-foreground truncate">{lead.title}</p>
              )
            )}

            {editing ? (
              <input
                value={draft.company as string ?? ''}
                onChange={(e) => set('company', e.target.value)}
                placeholder="Company"
                className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              lead.company && (
                <p className="mt-0.5 flex items-center gap-1 text-xs font-medium">
                  <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                  {lead.company}
                </p>
              )
            )}
          </div>
        </div>

        {/* Status + Interest + edit button */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Status dropdown */}
            {onStatusChange ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity',
                      statusMeta.badge
                    )}
                  >
                    {statusMeta.label}
                    <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" minWidth="170px">
                  <DropdownMenuLabel>Change status</DropdownMenuLabel>
                  {ALL_STATUSES.map((s) => {
                    const m = STATUS_CONFIG[s]
                    return (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => onStatusChange(s)}
                        className={cn(s === lead.status && 'opacity-50 cursor-default')}
                      >
                        <span className={cn('h-2 w-2 rounded-full shrink-0', m.dot)} />
                        {m.label}
                        {s === lead.status && (
                          <span className="ml-auto text-xs text-muted-foreground">current</span>
                        )}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                statusMeta.badge
              )}>
                {statusMeta.label}
              </span>
            )}

            {/* Interest level dropdown */}
            {onInterestChange && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity',
                      interestMeta ? interestMeta.badge : 'bg-slate-100 text-slate-600 border-slate-200'
                    )}
                  >
                    {interestMeta?.label ?? 'Interest'}
                    <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" minWidth="160px">
                  <DropdownMenuLabel>Interest level</DropdownMenuLabel>
                  {ALL_INTEREST_STATUSES.map((s) => {
                    const m = INTEREST_CONFIG[s]
                    return (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => onInterestChange(s)}
                        className={cn(s === lead.interest_status && 'opacity-50 cursor-default')}
                      >
                        <span className={cn('h-2 w-2 rounded-full shrink-0', m.dot)} />
                        {m.label}
                        {s === lead.interest_status && (
                          <span className="ml-auto text-xs text-muted-foreground">current</span>
                        )}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {!editing ? (
            <Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1.5 text-xs" onClick={startEdit}>
              <Pencil className="h-3 w-3" /> Edit
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={cancelEdit} disabled={saving}>
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleSave} disabled={saving}>
                <Check className="h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Fields ── */}
      <div className="divide-y divide-border px-5">

        <ProfileField
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Email"
          editing={editing}
          empty={!lead.email && !editing}
        >
          {editing ? (
            <input
              type="email"
              value={get('email')}
              onChange={(e) => set('email', e.target.value)}
              className={cn(fieldInput)}
            />
          ) : (
            <div className="space-y-1">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="block font-mono text-xs text-primary hover:underline break-all">
                  {lead.email}
                </a>
              )}
              {lead.custom_fields?.email_2 && (
                <a href={`mailto:${lead.custom_fields.email_2}`} className="block font-mono text-xs text-primary/70 hover:underline break-all">
                  {lead.custom_fields.email_2}
                </a>
              )}
              {lead.custom_fields?.email_3 && (
                <a href={`mailto:${lead.custom_fields.email_3}`} className="block font-mono text-xs text-primary/70 hover:underline break-all">
                  {lead.custom_fields.email_3}
                </a>
              )}
            </div>
          )}
        </ProfileField>

        <ProfileField
          icon={<Phone className="h-3.5 w-3.5" />}
          label="Phone"
          editing={editing}
          empty={!lead.phone && !lead.custom_fields?.phone_2 && !editing}
        >
          {editing ? (
            <input
              type="tel"
              value={get('phone')}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="Add phone…"
              className={cn(fieldInput)}
            />
          ) : (
            <div className="space-y-1">
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="block text-sm hover:underline">
                  {lead.phone}
                </a>
              )}
              {lead.custom_fields?.phone_2 && (
                <a href={`tel:${lead.custom_fields.phone_2}`} className="block text-sm text-muted-foreground hover:underline">
                  {lead.custom_fields.phone_2}
                </a>
              )}
              {lead.custom_fields?.phone_3 && (
                <a href={`tel:${lead.custom_fields.phone_3}`} className="block text-sm text-muted-foreground hover:underline">
                  {lead.custom_fields.phone_3}
                </a>
              )}
              {lead.custom_fields?.company_phone && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Company</p>
                  <a href={`tel:${lead.custom_fields.company_phone}`} className="block text-sm text-muted-foreground hover:underline">
                    {lead.custom_fields.company_phone}
                  </a>
                  {lead.custom_fields?.company_phone_2 && (
                    <a href={`tel:${lead.custom_fields.company_phone_2}`} className="block text-sm text-muted-foreground hover:underline">
                      {lead.custom_fields.company_phone_2}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </ProfileField>

        <ProfileField
          icon={<Globe className="h-3.5 w-3.5" />}
          label="Website"
          editing={editing}
          empty={!lead.website && !editing}
        >
          {editing ? (
            <input
              type="url"
              value={get('website')}
              onChange={(e) => set('website', e.target.value)}
              placeholder="https://…"
              className={cn(fieldInput)}
            />
          ) : (
            lead.website && (
              <a
                href={lead.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline truncate"
              >
                {lead.website.replace(/^https?:\/\//, '')}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            )
          )}
        </ProfileField>

        <ProfileField
          icon={<Linkedin className="h-3.5 w-3.5" />}
          label="LinkedIn"
          editing={editing}
          empty={!lead.linkedin_url && !editing}
        >
          {editing ? (
            <input
              type="url"
              value={get('linkedin_url')}
              onChange={(e) => set('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/in/…"
              className={cn(fieldInput)}
            />
          ) : (
            lead.linkedin_url && (
              <a
                href={lead.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View profile
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            )
          )}
        </ProfileField>

        {/* State — from custom_fields, read-only */}
        {lead.custom_fields?.contact_state && (
          <ProfileField icon={<MapPin className="h-3.5 w-3.5" />} label="State">
            <span className="text-sm">{lead.custom_fields.contact_state}</span>
          </ProfileField>
        )}

        {/* Batch — `batch_name` is always the saved name from `lead_batches`; editable here */}
        {lead.batch_id && (
          <ProfileField icon={<Package className="h-3.5 w-3.5" />} label="Batch">
            {batchEditing ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  value={batchDraft}
                  onChange={(e) => setBatchDraft(e.target.value)}
                  maxLength={150}
                  placeholder="Batch name"
                  className="h-8 min-w-[10rem] flex-1 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setBatchEditing(false)
                      setBatchDraft(lead.batch_name ?? '')
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={batchSaving || !batchDraft.trim()}
                  onClick={async () => {
                    if (!onRenameBatch || !batchDraft.trim()) return
                    setBatchSaving(true)
                    try {
                      await onRenameBatch(batchDraft.trim())
                      setBatchEditing(false)
                    } finally {
                      setBatchSaving(false)
                    }
                  }}
                >
                  {batchSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 shrink-0"
                  disabled={batchSaving}
                  onClick={() => {
                    setBatchEditing(false)
                    setBatchDraft(lead.batch_name ?? '')
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm break-words">{lead.batch_name ?? 'Unnamed batch'}</span>
                {canEditBatch && onRenameBatch && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setBatchDraft(lead.batch_name ?? '')
                      setBatchEditing(true)
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    Rename
                  </Button>
                )}
              </div>
            )}
          </ProfileField>
        )}

        {/* Assigned to */}
        <ProfileField icon={<UserRound className="h-3.5 w-3.5" />} label="Assigned To">
          {lead.assigned_name ? (
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary shrink-0">
                {lead.assigned_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm">{lead.assigned_name}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Unassigned</span>
          )}
        </ProfileField>

      </div>

      {/* ── AI Summary ── */}
      {lead.ai_summary && (
        <div className="mx-5 my-4 rounded-xl border border-border bg-secondary p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            AI Summary
          </div>
          <p className="text-xs leading-relaxed text-foreground">
            {lead.ai_summary}
          </p>
        </div>
      )}

      {/* ── Custom fields ── */}
      {Object.keys(lead.custom_fields).length > 0 && (
        <div className="border-t border-border px-5 pt-4 pb-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Custom Fields
          </p>
          <div className="space-y-2">
            {Object.entries(lead.custom_fields).map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-2 text-sm">
                <span className="text-muted-foreground capitalize min-w-0">
                  {key.replace(/_/g, ' ')}
                </span>
                <span className="font-medium text-right break-words">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Profile field row ──────────────────────────────────────────────────────
function ProfileField({
  icon, label, children, editing, empty,
}: {
  icon?:    React.ReactNode
  label:    string
  children: React.ReactNode
  editing?: boolean
  empty?:   boolean
}) {
  if (empty && !editing) return null

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground/60">
        {icon}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}

const fieldInput =
  'h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

// Re-export Linkedin icon workaround (lucide exports it as 'Linkedin' with capital L)
function Linkedin(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
      <rect width="4" height="12" x="2" y="9"/>
      <circle cx="4" cy="4" r="2"/>
    </svg>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { AlertCircle, CheckCircle2, Info, ChevronUp, ChevronDown, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { ParsedFile, FieldMapping, CustomFieldNames } from './types'
import { CRM_FIELDS } from './types'

// ── Auto-detect ────────────────────────────────────────────────────────────
function autoDetect(header: string): import('./types').CrmField {
  const s = header.toLowerCase().replace(/[\s_\-\.]/g, '')

  // Full name
  if (s === 'fullname' || s === 'contactfullname' || s === 'name' || s === 'contactname') return 'full_name'
  if (s === 'firstname' || s === 'fname' || s === 'first') return 'ignore'
  if (s === 'lastname' || s === 'lname' || s === 'last' || s === 'surname') return 'ignore'

  // Emails
  if (s === 'email1' || s === 'email' || s === 'emailaddress') return 'email'
  if (s === 'email2') return 'email_2'
  if (s === 'email3' || s === 'contactemail') return 'email_3'
  if (s.includes('emailvalid') || s.includes('emailtotal')) return 'ignore'
  if (s.includes('email') || s.includes('mail')) return 'email'

  // Phones
  if (s === 'contactphone1' || s === 'phone1' || s === 'phone' || s === 'mobile') return 'phone'
  if (s === 'contactphone2' || s === 'phone2') return 'phone_2'
  if (s === 'contactphone3' || s === 'phone3') return 'phone_3'
  if (s.includes('companyphone') || s.includes('businessphone')) return 'company_phone'
  if (s.includes('phone') || s.includes('tel') || s.includes('cell') || s.includes('mobile')) return 'phone'

  // LinkedIn — before generic website/url checks
  if (s.includes('linkedin') || s === 'liprofile' || s === 'contactliprofileurl') return 'linkedin_url'

  // Other fields
  if (s.includes('company') || s.includes('organization') || s.includes('org')) return 'company'
  if (s.includes('title') || s.includes('jobtitle') || s.includes('position') || s.includes('role')) return 'title'
  if (s.includes('website') || s.includes('domain') || s === 'site') return 'website'

  // State
  if (s === 'contactstate' || s === 'contactstateabbr' || s === 'state' || s === 'stateabbr' || s === 'province') return 'contact_state'

  return 'ignore'
}

function storageKey(headers: string[]) {
  return `import_col_order_${[...headers].sort().join('|')}`
}

// ── Component ──────────────────────────────────────────────────────────────
interface FieldMappingStepProps {
  file:               ParsedFile
  mapping:            FieldMapping
  customFieldNames:   CustomFieldNames
  onChange:           (mapping: FieldMapping) => void
  onCustomNamesChange:(names: CustomFieldNames) => void
}

export function FieldMappingStep({
  file, mapping, customFieldNames, onChange, onCustomNamesChange,
}: FieldMappingStepProps) {
  const [orderedHeaders, setOrderedHeaders] = useState<string[]>([])
  const [editingName, setEditingName] = useState<string | null>(null) // header being renamed

  // Init order from localStorage or file headers
  useEffect(() => {
    const key = storageKey(file.headers)
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed: string[] = JSON.parse(saved)
        // Only use saved order if it contains exactly the same headers
        if (parsed.length === file.headers.length && file.headers.every(h => parsed.includes(h))) {
          setOrderedHeaders(parsed)
          return
        }
      }
    } catch { /* ignore */ }
    setOrderedHeaders([...file.headers])
  }, [file.headers])

  // Auto-detect mapping on first render
  useEffect(() => {
    const initial: FieldMapping = {}
    const usedFields = new Set<import('./types').CrmField>()
    for (const header of file.headers) {
      const detected = autoDetect(header)
      const isRepeatable = detected === 'ignore' || detected === 'custom'
      if (!isRepeatable && usedFields.has(detected)) {
        initial[header] = 'ignore'
      } else {
        initial[header] = detected
        if (!isRepeatable) usedFields.add(detected)
      }
    }
    onChange(initial)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveOrder = useCallback((headers: string[]) => {
    try {
      localStorage.setItem(storageKey(file.headers), JSON.stringify(headers))
    } catch { /* ignore */ }
  }, [file.headers])

  function moveUp(i: number) {
    if (i === 0) return
    const next = [...orderedHeaders]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    setOrderedHeaders(next)
    saveOrder(next)
  }

  function moveDown(i: number) {
    if (i === orderedHeaders.length - 1) return
    const next = [...orderedHeaders]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    setOrderedHeaders(next)
    saveOrder(next)
  }

  function setField(header: string, value: import('./types').CrmField) {
    onChange({ ...mapping, [header]: value })
    // Reset custom name if un-mapping from custom
    if (value !== 'custom') {
      const next = { ...customFieldNames }
      delete next[header]
      onCustomNamesChange(next)
    }
  }

  function setCustomName(header: string, name: string) {
    onCustomNamesChange({ ...customFieldNames, [header]: name })
  }

  const emailMapped   = Object.values(mapping).includes('email')
  const duplicateFields = getDuplicates(mapping)
  const mappedCount   = Object.values(mapping).filter(v => v !== 'ignore' && v !== 'custom').length
  const customCount   = Object.values(mapping).filter(v => v === 'custom').length

  if (orderedHeaders.length === 0) return null

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className={cn(
        'flex items-start gap-3 rounded-xl p-4',
        emailMapped ? 'bg-secondary text-foreground' : 'bg-secondary text-foreground'
      )}>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="text-sm">
          <p>
            {mappedCount} standard + {customCount} custom of {file.headers.length} columns will be imported.
            {' '}{file.headers.length - mappedCount - customCount} skipped.
            {!emailMapped && <span className="ml-1 text-muted-foreground">(Tip: mapping an Email column enables deduplication.)</span>}
          </p>
        </div>
      </div>

      {duplicateFields.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm text-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p><span className="font-semibold">Duplicate mapping:</span> {duplicateFields.join(', ')} mapped to the same field.</p>
        </div>
      )}

      {/* Mapping table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[32px_1fr_140px_1fr] gap-0 border-b border-border bg-muted/50 px-3 py-2.5">
          <div />
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CSV Column</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sample</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Map To</div>
        </div>

        <div className="divide-y divide-border">
          {orderedHeaders.map((header, i) => {
            const currentValue  = mapping[header] ?? 'ignore'
            const isIgnored     = currentValue === 'ignore'
            const isCustom      = currentValue === 'custom'
            const isRequired    = currentValue === 'email'
            const sampleValues  = file.preview.map(r => r[header]).filter(Boolean).slice(0, 2)
            const customName    = customFieldNames[header] ?? ''
            const isEditingThis = editingName === header

            return (
              <div
                key={header}
                className={cn(
                  'grid grid-cols-[32px_1fr_140px_1fr] items-start gap-0 px-3 py-3 transition-colors',
                  isIgnored && 'opacity-50'
                )}
              >
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-20"
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === orderedHeaders.length - 1}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-20"
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* CSV column name + custom name editor */}
                <div className="flex flex-col gap-1 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-sm font-medium">{header}</span>
                    {isRequired && <Badge variant="default" className="shrink-0 text-[10px]">Required</Badge>}
                  </div>
                  {isCustom && (
                    <div className="flex items-center gap-1.5">
                      {isEditingThis ? (
                        <input
                          autoFocus
                          value={customName}
                          onChange={e => setCustomName(header, e.target.value)}
                          onBlur={() => setEditingName(null)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(null) }}
                          placeholder={header}
                          className="h-6 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingName(header)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Pencil className="h-3 w-3" />
                          {customName || <span className="text-muted-foreground italic">Name this field…</span>}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Sample values */}
                <div className="min-w-0 pr-4 pt-1">
                  {sampleValues.length > 0 ? (
                    <div className="space-y-0.5">
                      {sampleValues.map((v, idx) => (
                        <p key={idx} className="truncate text-xs text-muted-foreground" title={v}>{v}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-muted-foreground/50">empty</p>
                  )}
                </div>

                {/* Field selector */}
                <div>
                  <Select
                    value={currentValue}
                    onChange={e => setField(header, e.target.value as import('./types').CrmField)}
                    className={cn(
                      'text-sm',
                      isRequired && 'border-border bg-secondary',
                      isIgnored  && 'text-muted-foreground',
                    )}
                  >
                    {CRM_FIELDS.map(f => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Data preview */}
      <DataPreview file={file} mapping={mapping} orderedHeaders={orderedHeaders} />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Use ↑↓ arrows to reorder. Your column order is saved for next time. Custom fields are stored in the lead's custom fields. Skip discards the column.
      </div>
    </div>
  )
}

// ── Data preview ──────────────────────────────────────────────────────────
function DataPreview({
  file, mapping, orderedHeaders,
}: { file: ParsedFile; mapping: FieldMapping; orderedHeaders: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = orderedHeaders.filter(h => mapping[h] !== 'ignore')
  if (visible.length === 0) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {expanded ? '▼' : '▶'} Preview first {Math.min(file.preview.length, 5)} rows
      </button>

      {expanded && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {visible.slice(0, 6).map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                    <div className="font-mono">{h}</div>
                    <div className="mt-0.5 text-[10px] font-normal text-primary/70">
                      → {CRM_FIELDS.find(f => f.value === mapping[h])?.label ?? mapping[h]}
                    </div>
                  </th>
                ))}
                {visible.length > 6 && (
                  <th className="px-4 py-2.5 text-left text-xs text-muted-foreground">+{visible.length - 6} more</th>
                )}
              </tr>
            </thead>
            <tbody>
              {file.preview.slice(0, 5).map((row, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30">
                  {visible.slice(0, 6).map(h => (
                    <td key={h} className="max-w-[160px] truncate px-4 py-2.5 text-xs" title={row[h]}>
                      {row[h] || <span className="italic text-muted-foreground/40">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function getDuplicates(mapping: FieldMapping): string[] {
  const seen = new Map<string, number>()
  for (const val of Object.values(mapping)) {
    if (val === 'ignore' || val === 'custom') continue
    seen.set(val, (seen.get(val) ?? 0) + 1)
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([key]) =>
    CRM_FIELDS.find(f => f.value === key)?.label ?? key
  )
}

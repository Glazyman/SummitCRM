'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { ParsedFile, FieldMapping, CrmField } from './types'
import { CRM_FIELDS } from './types'

// ── Auto-detect field mapping from CSV header name ─────────────────────────
function autoDetect(header: string): CrmField {
  const s = header.toLowerCase().replace(/[\s_\-\.]/g, '')
  if (s.includes('email') || s.includes('mail')) return 'email'
  if (s === 'firstname' || s === 'fname' || s === 'first') return 'first_name'
  if (s === 'lastname' || s === 'lname' || s === 'last' || s === 'surname') return 'last_name'
  if (s.includes('company') || s.includes('organization') || s.includes('org')) return 'company'
  if (s.includes('title') || s.includes('jobtitle') || s.includes('position') || s.includes('role')) return 'title'
  if (s.includes('phone') || s.includes('mobile') || s.includes('tel') || s.includes('cell')) return 'phone'
  if (s.includes('website') || s.includes('domain') || s.includes('url') || s === 'site') return 'website'
  if (s.includes('linkedin')) return 'linkedin_url'
  if (s === 'name' || s === 'fullname' || s === 'contactname') return 'first_name'
  return 'ignore'
}

// ── Component ──────────────────────────────────────────────────────────────
interface FieldMappingStepProps {
  file: ParsedFile
  mapping: FieldMapping
  onChange: (mapping: FieldMapping) => void
}

export function FieldMappingStep({ file, mapping, onChange }: FieldMappingStepProps) {
  // Seed initial auto-detected mapping on first render
  useEffect(() => {
    const initial: FieldMapping = {}
    const usedFields = new Set<CrmField>()
    for (const header of file.headers) {
      const detected = autoDetect(header)
      // Don't auto-map the same CRM field to two columns
      if (detected !== 'ignore' && detected !== 'custom' && usedFields.has(detected)) {
        initial[header] = 'ignore'
      } else {
        initial[header] = detected
        if (detected !== 'ignore' && detected !== 'custom') {
          usedFields.add(detected)
        }
      }
    }
    onChange(initial)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function setField(header: string, value: CrmField) {
    onChange({ ...mapping, [header]: value })
  }

  const emailMapped = Object.values(mapping).includes('email')
  const duplicateFields = getDuplicates(mapping)
  const mappedCount = Object.values(mapping).filter(
    (v) => v !== 'ignore' && v !== 'custom'
  ).length

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className={cn(
        'flex items-start gap-3 rounded-xl p-4',
        emailMapped
          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/15 dark:text-emerald-300'
          : 'bg-amber-50 text-amber-800 dark:bg-amber-900/15 dark:text-amber-300'
      )}>
        {emailMapped
          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        }
        <div className="text-sm">
          {emailMapped ? (
            <p>
              <span className="font-semibold">Email column mapped.</span>{' '}
              {mappedCount} of {file.headers.length} columns will be imported.
              {' '}{file.headers.length - mappedCount} will be skipped.
            </p>
          ) : (
            <p>
              <span className="font-semibold">Email column is required.</span>{' '}
              Please map at least one column to <strong>Email</strong> before continuing.
            </p>
          )}
        </div>
      </div>

      {/* Duplicate field warning */}
      {duplicateFields.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-900/15 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Duplicate mapping:</span>{' '}
            {duplicateFields.join(', ')} mapped to the same CRM field. Only the first match will be used.
          </p>
        </div>
      )}

      {/* Mapping table */}
      <div className="overflow-hidden rounded-xl border border-border">
        {/* Header */}
        <div className="grid grid-cols-[1fr_140px_1fr] gap-0 border-b border-border bg-muted/50 px-4 py-2.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CSV Column</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sample Value</div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Map To</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {file.headers.map((header) => {
            const currentValue = mapping[header] ?? 'ignore'
            const sampleValues = file.preview
              .map((row) => row[header])
              .filter(Boolean)
              .slice(0, 3)
            const isIgnored = currentValue === 'ignore'
            const isRequired = currentValue === 'email'

            return (
              <div
                key={header}
                className={cn(
                  'grid grid-cols-[1fr_140px_1fr] items-center gap-0 px-4 py-3 transition-colors',
                  isIgnored && 'opacity-50'
                )}
              >
                {/* CSV column name */}
                <div className="flex items-center gap-2 pr-4">
                  <span className="truncate font-mono text-sm font-medium">{header}</span>
                  {isRequired && (
                    <Badge variant="default" className="shrink-0 text-[10px]">Required</Badge>
                  )}
                </div>

                {/* Sample values */}
                <div className="min-w-0 pr-4">
                  {sampleValues.length > 0 ? (
                    <div className="space-y-0.5">
                      {sampleValues.map((v, i) => (
                        <p key={i} className="truncate text-xs text-muted-foreground" title={v}>
                          {v}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic">empty</p>
                  )}
                </div>

                {/* CRM field selector */}
                <div>
                  <Select
                    value={currentValue}
                    onChange={(e) => setField(header, e.target.value as CrmField)}
                    className={cn(
                      'text-sm',
                      currentValue === 'email' && 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10',
                      currentValue === 'ignore' && 'text-muted-foreground',
                    )}
                  >
                    {CRM_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}{f.required ? ' *' : ''}
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
      <DataPreview file={file} mapping={mapping} />

      {/* Hint */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        Columns mapped to <strong>Custom field</strong> are stored in the lead&apos;s custom fields JSON.
        Columns set to <strong>Skip</strong> are discarded.
      </div>
    </div>
  )
}

// ── Data preview table ─────────────────────────────────────────────────────
function DataPreview({ file, mapping }: { file: ParsedFile; mapping: FieldMapping }) {
  const [expanded, setExpanded] = useState(false)
  const visibleHeaders = file.headers.filter((h) => mapping[h] !== 'ignore')

  if (visibleHeaders.length === 0) return null

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
                {visibleHeaders.slice(0, 6).map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground"
                  >
                    <div className="font-mono">{h}</div>
                    <div className="mt-0.5 text-[10px] font-normal text-primary/70">
                      → {CRM_FIELDS.find((f) => f.value === mapping[h])?.label ?? mapping[h]}
                    </div>
                  </th>
                ))}
                {visibleHeaders.length > 6 && (
                  <th className="px-4 py-2.5 text-left text-xs text-muted-foreground">
                    +{visibleHeaders.length - 6} more
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {file.preview.slice(0, 5).map((row, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30">
                  {visibleHeaders.slice(0, 6).map((h) => (
                    <td key={h} className="max-w-[160px] truncate px-4 py-2.5 text-xs" title={row[h]}>
                      {row[h] || <span className="text-muted-foreground/40 italic">—</span>}
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

// ── Helpers ────────────────────────────────────────────────────────────────
function getDuplicates(mapping: FieldMapping): string[] {
  const seen = new Map<string, number>()
  for (const val of Object.values(mapping)) {
    if (val === 'ignore' || val === 'custom') continue
    seen.set(val, (seen.get(val) ?? 0) + 1)
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => {
    return CRM_FIELDS.find((f) => f.value === key)?.label ?? key
  })
}

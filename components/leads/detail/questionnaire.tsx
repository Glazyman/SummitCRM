'use client'

import * as React from 'react'
import { Plus, Save, Trash2, ClipboardList, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SelectMenu } from '@/components/ui/select-menu'
import { cn } from '@/lib/utils'

// ── Field format metadata ─────────────────────────────────────────────────────
type FieldFormat = 'dollar' | 'percent'
const FIELD_FORMATS: Record<string, FieldFormat> = {
  residential_pct:   'percent',
  commercial_pct:    'percent',
  install_pct:       'percent',
  retrofit_pct:      'percent',
  service_maint_pct: 'percent',
  avg_job_size:      'dollar',
  revenue:           'dollar',
  ebitda:            'dollar',
}

// Parse M/K/B suffixes and reformat dollar values on blur
// e.g. "2.5M" → "$2.5M", "2500000" → "$2.5M", "50k" → "$50K"
function autoFormatDollar(raw: string): string {
  const s = raw.replace(/^\$/, '').replace(/,/g, '').trim()
  if (!s) return ''
  const numStr = s.replace(/[^0-9.]/g, '')
  const num = parseFloat(numStr)
  if (isNaN(num) || num === 0) return s ? `$${s}` : ''

  let val = num
  if      (/[Bb]/i.test(s)) val = num * 1_000_000_000
  else if (/[Mm]/i.test(s)) val = num * 1_000_000
  else if (/[Kk]/i.test(s)) val = num * 1_000

  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (val >= 1_000_000)     return `$${(val / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (val >= 10_000)        return `$${(val / 1_000).toFixed(0)}K`
  return `$${val.toLocaleString()}`
}

// Normalize percent on blur: "90" → "90%", "90.5" → "90.5%"
function autoFormatPercent(raw: string): string {
  const s = raw.replace(/%$/, '').trim()
  if (!s) return ''
  const num = parseFloat(s)
  return isNaN(num) ? `${s}%` : `${num}%`
}

function autoFormat(value: string, format: FieldFormat | undefined): string {
  if (!value.trim() || !format) return value
  if (format === 'dollar')  return autoFormatDollar(value)
  if (format === 'percent') return autoFormatPercent(value)
  return value
}

// Strip prefix/suffix for the raw input display while typing
function stripAdornment(value: string, format: FieldFormat | undefined): string {
  if (!format) return value
  if (format === 'dollar')  return value.startsWith('$') ? value.slice(1) : value
  if (format === 'percent') return value.endsWith('%')   ? value.slice(0, -1) : value
  return value
}

// ── Default Summit Mergers questionnaire fields ───────────────────────────────
export const DEFAULT_QUESTIONS: QuestionDef[] = [
  { id: 'employees',           label: 'Employees',               type: 'text',     placeholder: '45',                    col: 1 },
  { id: 'union',               label: 'Union',                   type: 'yesno',                                          col: 1 },
  { id: 'years_in_business',   label: 'Years in business',       type: 'text',     placeholder: '23',                    col: 1 },
  { id: 'service_area',        label: 'Service area',            type: 'text',     placeholder: 'e.g. Las Vegas, Utah',  col: 1 },
  { id: 'residential_pct',     label: 'Residential',             type: 'text',     placeholder: '90',                    col: 1 },
  { id: 'commercial_pct',      label: 'Commercial',              type: 'text',     placeholder: '10',                    col: 1 },
  { id: 'install_pct',         label: 'Install',                 type: 'text',     placeholder: '80',                    col: 1 },
  { id: 'retrofit_pct',        label: 'Retrofit',                type: 'text',     placeholder: '10',                    col: 1 },
  { id: 'service_maint_pct',   label: 'Service & Maintenance',   type: 'text',     placeholder: '10',                    col: 1 },
  { id: 'avg_job_size',        label: 'Average job size',        type: 'text',     placeholder: '50K',                   col: 1 },
  { id: 'revenue',             label: 'Revenue',                 type: 'text',     placeholder: '10.7M',                 col: 1 },
  { id: 'ebitda',              label: 'EBITDA',                  type: 'text',     placeholder: '2.5M',                  col: 1 },
  { id: 'service_breakdown',   label: 'Service mix / breakdown', type: 'textarea', placeholder: 'e.g. Access Control, Burglar Alarm, Surveillance...' },
  { id: 'main_service',        label: 'Main service',            type: 'textarea', placeholder: 'e.g. New Construction, Retrofit...' },
  { id: 'largest_project',     label: 'Largest project',         type: 'textarea', placeholder: 'e.g. $1.5M – Multi-year contract' },
  { id: 'key_employees',       label: 'Key employees',           type: 'textarea', placeholder: 'e.g. Everyone except owners' },
  { id: 'owner_plans',         label: 'Company / owner plans',   type: 'textarea', placeholder: 'e.g. Retire, sell, grow...' },
]

export interface QuestionDef {
  id:          string
  label:       string
  type:        'text' | 'textarea' | 'yesno'
  placeholder?: string
  custom?:     boolean
  col?:        number
}

export interface QuestionnaireData {
  answers:   Record<string, string>
  questions: QuestionDef[]
}

interface QuestionnaireProps {
  leadId:    string
  data:      QuestionnaireData | null
  onSave:    (data: QuestionnaireData) => Promise<void>
  readOnly?: boolean
}

// ── Yes / No toggle ──────────────────────────────────────────────────────────
function YesNoToggle({
  value,
  readOnly,
  onChange,
}: {
  value:     string
  readOnly?: boolean
  onChange:  (v: string) => void
}) {
  const current = value.toLowerCase()
  return (
    <div className="flex h-11 gap-2">
      {(['Yes', 'No'] as const).map((opt) => {
        const active = current === opt.toLowerCase()
        return (
          <button
            key={opt}
            type="button"
            disabled={readOnly}
            onClick={() => onChange(active ? '' : opt)}
            className={cn(
              'flex-1 rounded-xl border text-[14px] font-semibold transition-all',
              active
                ? opt === 'Yes'
                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                  : 'bg-red-500 border-red-500 text-white shadow-sm'
                : 'border-border bg-background text-muted-foreground hover:shadow-sm',
              readOnly && 'pointer-events-none opacity-60',
            )}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

// ── Adorned input ($ prefix / % suffix) ──────────────────────────────────────
function AdornedInput({
  value,
  format,
  placeholder,
  readOnly,
  onChange,
  onBlur,
}: {
  value:       string
  format:      FieldFormat | undefined
  placeholder?: string
  readOnly?:   boolean
  onChange:    (v: string) => void
  onBlur:      (v: string) => void
}) {
  const raw = stripAdornment(value, format)

  return (
    <div className={cn(
      'flex h-11 items-center rounded-xl border border-border bg-background px-3.5 gap-1.5 transition-colors',
      'focus-within:ring-2 focus-within:ring-ring focus-within:border-foreground/30',
      readOnly && 'opacity-60 pointer-events-none bg-muted/30',
    )}>
      {format === 'dollar' && (
        <span className="text-[14px] font-semibold text-muted-foreground select-none">$</span>
      )}
      <input
        type="text"
        value={raw}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => {
          // Store raw while typing; adornment is visual-only
          const v = e.target.value
          onChange(format === 'dollar' ? `$${v}` : format === 'percent' ? `${v}%` : v)
        }}
        onBlur={() => onBlur(autoFormat(value, format))}
        className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/60 outline-none min-w-0"
      />
      {format === 'percent' && (
        <span className="text-[14px] font-semibold text-muted-foreground select-none">%</span>
      )}
    </div>
  )
}

// ── Plain text input ──────────────────────────────────────────────────────────
function PlainInput({
  value,
  placeholder,
  readOnly,
  onChange,
}: {
  value:        string
  placeholder?: string
  readOnly?:    boolean
  onChange:     (v: string) => void
}) {
  return (
    <input
      type="text"
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-11 w-full rounded-xl border border-border bg-background px-3.5 text-[14px] text-foreground',
        'placeholder:text-muted-foreground/60 outline-none transition-colors',
        'focus:ring-2 focus:ring-ring focus:border-foreground/30',
        readOnly && 'opacity-60 pointer-events-none bg-muted/30',
      )}
    />
  )
}

// ── Textarea ──────────────────────────────────────────────────────────────────
function StyledTextarea({
  value,
  placeholder,
  readOnly,
  onChange,
}: {
  value:        string
  placeholder?: string
  readOnly?:    boolean
  onChange:     (v: string) => void
}) {
  return (
    <textarea
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className={cn(
        'w-full rounded-xl border border-border bg-background px-3.5 py-3 text-[14px] text-foreground',
        'placeholder:text-muted-foreground/60 outline-none resize-none transition-colors',
        'focus:ring-2 focus:ring-ring focus:border-foreground/30',
        readOnly && 'opacity-60 pointer-events-none bg-muted/30',
      )}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function Questionnaire({ leadId, data, onSave, readOnly }: QuestionnaireProps) {
  const [answers,   setAnswers]   = React.useState<Record<string, string>>(data?.answers   ?? {})
  const [questions, setQuestions] = React.useState<QuestionDef[]>(
    data?.questions ?? DEFAULT_QUESTIONS
  )
  const [saving, setSaving] = React.useState(false)
  const [saved,  setSaved]  = React.useState(false)
  const [dirty,  setDirty]  = React.useState(false)

  const [addingCustom, setAddingCustom] = React.useState(false)
  const [newQLabel,    setNewQLabel]    = React.useState('')
  const [newQType,     setNewQType]     = React.useState<'text' | 'textarea'>('text')

  function setAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }))
    setDirty(true)
    setSaved(false)
  }

  function addCustomQuestion() {
    if (!newQLabel.trim()) return
    const id = `custom_${Date.now()}`
    const q: QuestionDef = { id, label: newQLabel.trim(), type: newQType, custom: true }
    setQuestions((qs) => [...qs, q])
    setNewQLabel('')
    setAddingCustom(false)
    setDirty(true)
    setSaved(false)
  }

  function removeCustomQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id))
    setAnswers((a) => { const next = { ...a }; delete next[id]; return next })
    setDirty(true)
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ answers, questions })
      setSaved(true)
      setDirty(false)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  // Split questions: inline (text/yesno) vs full-width (textarea)
  const gridQuestions = questions.filter(q => q.type === 'text' || q.type === 'yesno')
  const fullQuestions = questions.filter(q => q.type === 'textarea')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Summit Mergers Questionnaire</h3>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            className={cn('gap-1.5', saved && 'bg-emerald-600 hover:bg-emerald-700')}
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : saving ? 'Saving…' : <><Save className="h-3.5 w-3.5" /> Save</>}
          </Button>
        )}
      </div>

      {/* 2-column grid for short fields */}
      {gridQuestions.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {gridQuestions.map((q) => {
            const format = FIELD_FORMATS[q.id]
            const value  = answers[q.id] ?? ''
            return (
              <div key={q.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.05em]">
                    {q.label}
                    {format === 'percent' && <span className="ml-1 text-muted-foreground/50">(%)</span>}
                    {q.custom && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-muted-foreground">custom</span>}
                  </Label>
                  {q.custom && !readOnly && (
                    <button type="button" onClick={() => removeCustomQuestion(q.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {q.type === 'yesno' ? (
                  <YesNoToggle
                    value={value}
                    readOnly={readOnly}
                    onChange={(v) => setAnswer(q.id, v)}
                  />
                ) : format ? (
                  <AdornedInput
                    value={value}
                    format={format}
                    placeholder={q.placeholder}
                    readOnly={readOnly}
                    onChange={(v) => setAnswer(q.id, v)}
                    onBlur={(v) => setAnswer(q.id, v)}
                  />
                ) : (
                  <PlainInput
                    value={value}
                    placeholder={q.placeholder}
                    readOnly={readOnly}
                    onChange={(v) => setAnswer(q.id, v)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Full-width textarea fields */}
      {fullQuestions.length > 0 && (
        <div className="space-y-4">
          {fullQuestions.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.05em]">
                  {q.label}
                  {q.custom && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-muted-foreground">custom</span>}
                </Label>
                {q.custom && !readOnly && (
                  <button type="button" onClick={() => removeCustomQuestion(q.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <StyledTextarea
                value={answers[q.id] ?? ''}
                placeholder={q.placeholder}
                readOnly={readOnly}
                onChange={(v) => setAnswer(q.id, v)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add custom question */}
      {!readOnly && (
        <div className="border-t border-border pt-4">
          {!addingCustom ? (
            <button
              type="button"
              onClick={() => setAddingCustom(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add question
            </button>
          ) : (
            <div className="space-y-3 rounded-2xl border border-dashed border-border p-4">
              <PlainInput
                value={newQLabel}
                placeholder="Question label"
                onChange={setNewQLabel}
              />
              <div className="flex items-center gap-2">
                <SelectMenu
                  value={newQType}
                  onChange={(v) => setNewQType(v as 'text' | 'textarea')}
                  size="sm"
                  options={[
                    { value: 'text',     label: 'Short answer' },
                    { value: 'textarea', label: 'Long answer'  },
                  ]}
                  className="flex-1"
                />
                <Button size="sm" onClick={addCustomQuestion} disabled={!newQLabel.trim()}>
                  Add
                </Button>
                <button
                  type="button"
                  onClick={() => { setAddingCustom(false); setNewQLabel('') }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

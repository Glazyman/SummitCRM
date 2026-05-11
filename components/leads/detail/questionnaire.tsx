'use client'

import * as React from 'react'
import { Plus, Save, Trash2, ClipboardList, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ── Default Summit Mergers questionnaire fields ───────────────────────────
export const DEFAULT_QUESTIONS: QuestionDef[] = [
  { id: 'employees',           label: 'Employees',                   type: 'text',     placeholder: 'e.g. 45' },
  { id: 'union',               label: 'Union',                       type: 'text',     placeholder: 'Yes / No' },
  { id: 'residential_pct',     label: 'Residential (%)',              type: 'text',     placeholder: 'e.g. 90' },
  { id: 'commercial_pct',      label: 'Commercial (%)',               type: 'text',     placeholder: 'e.g. 10' },
  { id: 'service_breakdown',   label: 'Service mix / breakdown',      type: 'textarea', placeholder: 'e.g. Access Control, Burglar Alarm, Surveillance...' },
  { id: 'main_service',        label: 'Main service',                 type: 'textarea', placeholder: 'e.g. New Construction, Retrofit...' },
  { id: 'install_pct',         label: 'Install %',                   type: 'text',     placeholder: 'e.g. 80' },
  { id: 'retrofit_pct',        label: 'Retrofit %',                  type: 'text',     placeholder: 'e.g. 10' },
  { id: 'service_maint_pct',   label: 'Service & Maintenance %',      type: 'text',     placeholder: 'e.g. 10' },
  { id: 'service_area',        label: 'Service area',                 type: 'text',     placeholder: 'e.g. Las Vegas, Utah' },
  { id: 'years_in_business',   label: 'Years in business',            type: 'text',     placeholder: 'e.g. 23' },
  { id: 'avg_job_size',        label: 'Average job size',             type: 'text',     placeholder: 'e.g. $50K' },
  { id: 'largest_project',     label: 'Largest project',              type: 'textarea', placeholder: 'e.g. $1.5M – Multi-year contract' },
  { id: 'revenue',             label: 'Revenue',                     type: 'text',     placeholder: 'e.g. $10.7M' },
  { id: 'ebitda',              label: 'EBITDA',                      type: 'text',     placeholder: 'e.g. $2.5M' },
  { id: 'key_employees',       label: 'Key employees',               type: 'textarea', placeholder: 'e.g. Everyone except owners' },
  { id: 'owner_plans',         label: 'Company / owner plans',        type: 'textarea', placeholder: 'e.g. Retire, sell, grow...' },
]

export interface QuestionDef {
  id:          string
  label:       string
  type:        'text' | 'textarea'
  placeholder?: string
  custom?:     boolean
}

export interface QuestionnaireData {
  answers:   Record<string, string>
  questions: QuestionDef[]   // includes custom questions
}

interface QuestionnaireProps {
  leadId:   string
  data:     QuestionnaireData | null
  onSave:   (data: QuestionnaireData) => Promise<void>
  readOnly?: boolean
}

export function Questionnaire({ leadId, data, onSave, readOnly }: QuestionnaireProps) {
  const [answers,   setAnswers]   = React.useState<Record<string, string>>(data?.answers   ?? {})
  const [questions, setQuestions] = React.useState<QuestionDef[]>(
    data?.questions ?? DEFAULT_QUESTIONS
  )
  const [saving,    setSaving]    = React.useState(false)
  const [saved,     setSaved]     = React.useState(false)
  const [dirty,     setDirty]     = React.useState(false)

  // Adding a custom question
  const [addingCustom,   setAddingCustom]   = React.useState(false)
  const [newQLabel,      setNewQLabel]      = React.useState('')
  const [newQType,       setNewQType]       = React.useState<'text' | 'textarea'>('text')

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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Summit Mergers Questionnaire</h3>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            className={cn('h-7 gap-1.5 text-xs', saved && 'bg-emerald-600 hover:bg-emerald-700')}
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saved ? <><Check className="h-3 w-3" /> Saved</> : saving ? 'Saving…' : <><Save className="h-3 w-3" /> Save</>}
          </Button>
        )}
      </div>

      {/* Question fields */}
      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                {q.label}
                {q.custom && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">custom</span>}
              </Label>
              {q.custom && !readOnly && (
                <button
                  type="button"
                  onClick={() => removeCustomQuestion(q.id)}
                  className="text-muted-foreground/50 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
            {q.type === 'textarea' ? (
              <Textarea
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder={q.placeholder}
                className="min-h-[60px] text-sm resize-none"
                readOnly={readOnly}
              />
            ) : (
              <Input
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder={q.placeholder}
                className="h-8 text-sm"
                readOnly={readOnly}
              />
            )}
          </div>
        ))}
      </div>

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
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <Input
                autoFocus
                placeholder="Question label"
                value={newQLabel}
                onChange={(e) => setNewQLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCustomQuestion() }}
                className="h-8 text-sm"
              />
              <div className="flex items-center gap-2">
                <select
                  value={newQType}
                  onChange={(e) => setNewQType(e.target.value as 'text' | 'textarea')}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="text">Short answer</option>
                  <option value="textarea">Long answer</option>
                </select>
                <Button size="sm" className="h-8 text-xs" onClick={addCustomQuestion} disabled={!newQLabel.trim()}>
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

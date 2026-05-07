'use client'

import * as React from 'react'
import {
  Plus, Trash2, ChevronUp, ChevronDown,
  Sparkles, Clock, GripVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BuilderStep, AiTone } from './types'

const AI_TONES: Array<{ value: AiTone; label: string }> = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual',       label: 'Casual'       },
  { value: 'direct',       label: 'Direct'       },
  { value: 'friendly',     label: 'Friendly'     },
]

interface SequenceBuilderProps {
  steps:     BuilderStep[]
  onChange:  (steps: BuilderStep[]) => void
}

export function SequenceBuilder({ steps, onChange }: SequenceBuilderProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(
    () => steps[0]?.id ?? null
  )

  function addStep() {
    const last = steps[steps.length - 1]
    const newStep: BuilderStep = {
      id:               `step-${Date.now()}`,
      step_number:      steps.length + 1,
      subject_template: steps.length === 0 ? '' : `Re: ${last?.subject_template ?? ''}`,
      body_template:    '',
      delay_days:       steps.length === 0 ? 0 : 3,
      use_ai:           false,
      ai_tone:          'professional',
    }
    onChange([...steps, newStep])
    setExpandedId(newStep.id)
  }

  function removeStep(id: string) {
    const updated = steps
      .filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, step_number: i + 1 }))
    onChange(updated)
    if (expandedId === id) setExpandedId(updated[0]?.id ?? null)
  }

  function moveStep(id: string, direction: 'up' | 'down') {
    const idx = steps.findIndex((s) => s.id === id)
    if (idx < 0) return
    if (direction === 'up'   && idx === 0)              return
    if (direction === 'down' && idx === steps.length - 1) return

    const newSteps = [...steps]
    const swap     = direction === 'up' ? idx - 1 : idx + 1
    ;[newSteps[idx], newSteps[swap]] = [newSteps[swap], newSteps[idx]]
    onChange(newSteps.map((s, i) => ({ ...s, step_number: i + 1 })))
  }

  function updateStep(id: string, patch: Partial<BuilderStep>) {
    onChange(steps.map((s) => s.id === id ? { ...s, ...patch } : s))
  }

  return (
    <div className="space-y-3">
      {steps.map((step, idx) => {
        const isExpanded = expandedId === step.id
        const isFirst    = idx === 0
        const isLast     = idx === steps.length - 1

        return (
          <div
            key={step.id}
            className={cn(
              'overflow-hidden rounded-2xl border transition-all',
              isExpanded ? 'border-primary/40 shadow-sm' : 'border-border hover:border-border/70'
            )}
          >
            {/* ── Step header ── */}
            <div
              className="flex cursor-pointer items-center gap-3 px-4 py-3 select-none"
              onClick={() => setExpandedId(isExpanded ? null : step.id)}
            >
              {/* Grip + step number */}
              <div className="flex items-center gap-2 shrink-0">
                <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                <div className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                  isExpanded ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  {step.step_number}
                </div>
              </div>

              {/* Summary */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {step.subject_template || <span className="italic text-muted-foreground">No subject yet</span>}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  {isFirst ? (
                    <span className="text-xs text-muted-foreground">Sends immediately</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      After {step.delay_days}d
                    </span>
                  )}
                  {step.use_ai && (
                    <span className="flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-px text-[10px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                      <Sparkles className="h-2.5 w-2.5" />
                      AI
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                <button type="button" disabled={isFirst} onClick={() => moveStep(step.id, 'up')}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" disabled={isLast} onClick={() => moveStep(step.id, 'down')}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" disabled={steps.length <= 1} onClick={() => removeStep(step.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* ── Step editor (expanded) ── */}
            {isExpanded && (
              <div className="border-t border-border/50 bg-muted/10 px-4 py-4 space-y-4">

                {/* Delay (not for step 1) */}
                {!isFirst && (
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex flex-1 items-center gap-2">
                      <label className="text-sm text-muted-foreground w-32 shrink-0">
                        Wait days after step {step.step_number - 1}
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={step.delay_days}
                        onChange={(e) => updateStep(step.id, { delay_days: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="h-8 w-24 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">days</span>
                    </div>
                  </div>
                )}

                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Subject line
                  </label>
                  <Input
                    value={step.subject_template}
                    onChange={(e) => updateStep(step.id, { subject_template: e.target.value })}
                    placeholder={`Quick question about {{company}}`}
                    className="h-9 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Use merge vars: {'{{first_name}}'}, {'{{company}}'}, {'{{title}}'}
                  </p>
                </div>

                {/* Body */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Email body
                  </label>
                  <textarea
                    value={step.body_template}
                    onChange={(e) => updateStep(step.id, { body_template: e.target.value })}
                    placeholder={'Hi {{first_name}},\n\nI noticed your team at {{company}}…'}
                    rows={7}
                    className={cn(
                      'w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm',
                      'placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring',
                      'resize-none leading-relaxed',
                      step.use_ai && 'opacity-50'
                    )}
                    disabled={step.use_ai}
                  />
                  {step.use_ai && (
                    <p className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
                      <Sparkles className="h-3 w-3" />
                      Body will be AI-generated per lead. Template above is used as a guide.
                    </p>
                  )}
                </div>

                {/* AI personalisation toggle */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-violet-500" />
                    <div>
                      <p className="text-sm font-medium">AI personalisation</p>
                      <p className="text-xs text-muted-foreground">Generate unique body per lead using GPT-4o-mini</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={step.use_ai}
                    onClick={() => updateStep(step.id, { use_ai: !step.use_ai })}
                    className={cn(
                      'relative h-5 w-9 rounded-full transition-colors',
                      step.use_ai ? 'bg-violet-500' : 'bg-input'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                      step.use_ai && 'translate-x-4'
                    )} />
                  </button>
                </div>

                {/* AI tone picker */}
                {step.use_ai && (
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground w-12">Tone</span>
                    <div className="flex flex-wrap gap-1.5">
                      {AI_TONES.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => updateStep(step.id, { ai_tone: t.value })}
                          className={cn(
                            'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                            step.ai_tone === t.value
                              ? 'border-violet-400 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Add step */}
      <button
        type="button"
        onClick={addStep}
        disabled={steps.length >= 10}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-3 text-sm font-medium transition-colors',
          'text-muted-foreground hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40'
        )}
      >
        <Plus className="h-4 w-4" />
        Add sequence step {steps.length > 0 && `(${steps.length}/10)`}
      </button>
    </div>
  )
}

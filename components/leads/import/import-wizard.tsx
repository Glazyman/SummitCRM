'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { UploadZone } from './upload-zone'
import { FieldMappingStep } from './field-mapping-step'
import { OptionsStep } from './options-step'
import { ProgressStep } from './progress-step'
import type { ParsedFile, FieldMapping, ImportOptions, ImportResult, ExistingBatch, WizardStep } from './types'

// ── Wizard steps config ───────────────────────────────────────────────────
const STEPS: { id: WizardStep; label: string; description: string }[] = [
  { id: 'upload',   label: 'Upload',    description: 'Choose file' },
  { id: 'mapping',  label: 'Map Fields', description: 'Match columns' },
  { id: 'options',  label: 'Options',   description: 'Batch & settings' },
  { id: 'progress', label: 'Import',    description: 'Processing' },
]

interface ImportWizardProps {
  /** Existing batches for the workspace dropdown */
  batches: ExistingBatch[]
  /** Called with the final field mapping + options to start the actual import */
  onImport: (args: {
    file: ParsedFile
    mapping: FieldMapping
    options: ImportOptions
  }) => Promise<ImportResult>
}

const DEFAULT_OPTIONS: ImportOptions = {
  batchId: null,
  newBatchName: '',
  duplicateMode: 'skip',
}

export function ImportWizard({ batches, onImport }: ImportWizardProps) {
  const router = useRouter()

  const [step, setStep] = useState<WizardStep>('upload')
  const [file, setFile] = useState<ParsedFile | null>(null)
  const [mapping, setMapping] = useState<FieldMapping>({})
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS)

  const currentIndex = STEPS.findIndex((s) => s.id === step)
  const emailMapped = Object.values(mapping).includes('email')

  // ── Navigation ──────────────────────────────────────────────────────────
  function goNext() {
    const order: WizardStep[] = ['upload', 'mapping', 'options', 'progress']
    const idx = order.indexOf(step)
    if (idx < order.length - 1) setStep(order[idx + 1])
  }

  function goBack() {
    const order: WizardStep[] = ['upload', 'mapping', 'options', 'progress']
    const idx = order.indexOf(step)
    if (idx > 0) setStep(order[idx - 1])
  }

  function resetWizard() {
    setStep('upload')
    setFile(null)
    setMapping({})
    setOptions(DEFAULT_OPTIONS)
  }

  function handleViewLeads(batchId?: string) {
    if (batchId) {
      router.push(`/leads?batch=${batchId}`)
    } else {
      router.push('/leads')
    }
  }

  // ── Can proceed? ────────────────────────────────────────────────────────
  function canProceed(): boolean {
    if (step === 'upload') return !!file
    if (step === 'mapping') return emailMapped
    if (step === 'options') return true
    return false
  }

  // ── Render step content ──────────────────────────────────────────────────
  function renderStep() {
    if (step === 'upload') {
      return (
        <UploadZone
          onFileParsed={(f) => {
            setFile(f)
            setMapping({})
          }}
        />
      )
    }

    if (step === 'mapping' && file) {
      return (
        <FieldMappingStep
          file={file}
          mapping={mapping}
          onChange={setMapping}
        />
      )
    }

    if (step === 'options' && file) {
      return (
        <OptionsStep
          file={file}
          mapping={mapping}
          options={options}
          batches={batches}
          onChange={setOptions}
        />
      )
    }

    if (step === 'progress' && file) {
      return (
        <ProgressStep
          onStart={() => onImport({ file, mapping, options })}
          onViewLeads={handleViewLeads}
          onImportAnother={resetWizard}
        />
      )
    }

    return null
  }

  const isProgressOrDone = step === 'progress'

  return (
    <div className="flex flex-col gap-6">
      {/* Step indicator */}
      <StepIndicator steps={STEPS} currentStep={step} currentIndex={currentIndex} />

      {/* Content card */}
      <div className="rounded-2xl border border-border bg-card">
        {/* Card header */}
        <div className="border-b border-border px-6 py-5">
          <h2 className="text-base font-semibold">
            {STEPS[currentIndex]?.label}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {step === 'upload'   && 'Upload a CSV or Excel file containing your leads.'}
            {step === 'mapping'  && 'Match your file\'s columns to CRM fields. Email is required.'}
            {step === 'options'  && 'Choose where to put the leads and how to handle duplicates.'}
            {step === 'progress' && 'Sit tight while we process and import your leads.'}
          </p>
        </div>

        {/* Card body */}
        <div className="p-6">
          {renderStep()}
        </div>

        {/* Card footer — navigation */}
        {!isProgressOrDone && (
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={step === 'upload'}
            >
              Back
            </Button>

            <div className="flex items-center gap-3">
              {!canProceed() && step === 'mapping' && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Map the Email column to continue
                </p>
              )}
              <Button
                type="button"
                onClick={goNext}
                disabled={!canProceed()}
              >
                {step === 'options' ? 'Start Import' : 'Continue'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step indicator ────────────────────────────────────────────────────────
function StepIndicator({
  steps,
  currentStep,
  currentIndex,
}: {
  steps: typeof STEPS
  currentStep: WizardStep
  currentIndex: number
}) {
  return (
    <nav aria-label="Import progress" className="flex items-center gap-0">
      {steps.map((s, i) => {
        const isDone = i < currentIndex
        const isCurrent = s.id === currentStep
        const isLast = i === steps.length - 1

        return (
          <div key={s.id} className="flex flex-1 items-center">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5">
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-200',
                isDone   && 'border-primary bg-primary text-primary-foreground',
                isCurrent && 'border-primary bg-primary/10 text-primary',
                !isDone && !isCurrent && 'border-border bg-background text-muted-foreground'
              )}>
                {isDone
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <span>{i + 1}</span>
                }
              </div>
              <div className="text-center">
                <p className={cn(
                  'text-xs font-medium leading-none',
                  isCurrent ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {s.label}
                </p>
                <p className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">
                  {s.description}
                </p>
              </div>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className={cn(
                'mx-2 h-0.5 flex-1 transition-all duration-300',
                i < currentIndex ? 'bg-primary' : 'bg-border'
              )} />
            )}
          </div>
        )
      })}
    </nav>
  )
}

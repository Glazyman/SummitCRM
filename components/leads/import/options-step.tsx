'use client'

import { useState } from 'react'
import { Plus, Users, CheckCircle2, AlertCircle, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import type { ImportOptions, ExistingBatch, FieldMapping, ParsedFile } from './types'
import { CRM_FIELDS } from './types'

interface OptionsStepProps {
  file: ParsedFile
  mapping: FieldMapping
  options: ImportOptions
  batches: ExistingBatch[]
  onChange: (options: ImportOptions) => void
}

export function OptionsStep({ file, mapping, options, batches, onChange }: OptionsStepProps) {
  const [showNewBatchDialog, setShowNewBatchDialog] = useState(false)
  const [newBatchDraft, setNewBatchDraft] = useState('')

  const mappedFields = Object.entries(mapping)
    .filter(([, v]) => v !== 'ignore')
    .map(([col, field]) => ({
      col,
      label: CRM_FIELDS.find((f) => f.value === field)?.label ?? field,
    }))

  const emailCol = Object.entries(mapping).find(([, v]) => v === 'email')?.[0]
  const selectedBatch = batches.find((b) => b.id === options.batchId)

  function confirmNewBatch() {
    if (!newBatchDraft.trim()) return
    onChange({ ...options, batchId: null, newBatchName: newBatchDraft.trim() })
    setNewBatchDraft('')
    setShowNewBatchDialog(false)
  }

  return (
    <div className="space-y-8">
      {/* Import summary */}
      <ImportSummary file={file} mapping={mapping} mappedFields={mappedFields} />

      {/* Batch assignment */}
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">Assign to batch</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Group imported leads into a batch for campaign targeting. Optional but recommended.
          </p>
        </div>

        <div className="space-y-3">
          <Select
            value={options.batchId ?? ''}
            onChange={(e) => {
              const val = e.target.value
              onChange({ ...options, batchId: val || null, newBatchName: '' })
            }}
          >
            <option value="">No batch (import without grouping)</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.leadCount.toLocaleString()} leads)
              </option>
            ))}
          </Select>

          {/* Selected batch info */}
          {selectedBatch && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
              <Layers className="h-4 w-4 text-primary" />
              <span className="font-medium">{selectedBatch.name}</span>
              <span className="text-muted-foreground">· {selectedBatch.leadCount.toLocaleString()} existing leads</span>
            </div>
          )}

          {/* New batch name (when manually entered) */}
          {options.batchId === null && options.newBatchName && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-sm">
              <Plus className="h-4 w-4 text-primary" />
              <span className="font-medium">New batch:</span>
              <span className="text-primary">{options.newBatchName}</span>
              <button
                type="button"
                className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                onClick={() => onChange({ ...options, newBatchName: '' })}
              >
                Remove
              </button>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowNewBatchDialog(true)}
          >
            <Plus className="h-4 w-4" />
            Create new batch
          </Button>
        </div>
      </section>

      {/* Duplicate handling */}
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">Duplicate handling</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            What to do when an imported email already exists in your workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DuplicateOption
            value="skip"
            current={options.duplicateMode}
            title="Skip duplicates"
            description="Keep the existing lead. The duplicate row is logged in the error report."
            icon={CheckCircle2}
            iconColor="text-foreground"
            onClick={() => onChange({ ...options, duplicateMode: 'skip' })}
          />
          <DuplicateOption
            value="update"
            current={options.duplicateMode}
            title="Update existing"
            description="Overwrite the existing lead's fields with data from the import file."
            icon={AlertCircle}
            iconColor="text-foreground"
            onClick={() => onChange({ ...options, duplicateMode: 'update' })}
          />
        </div>
      </section>

      {/* Final summary */}
      <div className="rounded-xl border border-border bg-muted/30 p-5 text-sm space-y-2.5">
        <h3 className="font-semibold text-foreground">Ready to import</h3>
        <ul className="space-y-1.5 text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            <strong className="text-foreground">{file.rowCount.toLocaleString()}</strong> rows will be processed
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            <strong className="text-foreground">{mappedFields.length}</strong> columns will be imported
            (matched to {emailCol ? <span className="text-primary font-medium">{emailCol}</span> : 'email'})
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            {options.batchId
              ? <>Leads will be added to <strong className="text-foreground">{selectedBatch?.name}</strong></>
              : options.newBatchName
                ? <>New batch <strong className="text-foreground">&ldquo;{options.newBatchName}&rdquo;</strong> will be created</>
                : 'No batch assignment'
            }
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            Duplicates will be{' '}
            <strong className="text-foreground">
              {options.duplicateMode === 'skip' ? 'skipped' : 'updated'}
            </strong>
          </li>
        </ul>
      </div>

      {/* New batch dialog */}
      <Dialog open={showNewBatchDialog} onClose={() => setShowNewBatchDialog(false)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Create new batch</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-1.5">
              <Label htmlFor="new-batch-name">Batch name</Label>
              <Input
                id="new-batch-name"
                placeholder="e.g. Q2 SaaS Founders"
                value={newBatchDraft}
                onChange={(e) => setNewBatchDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && confirmNewBatch()}
              />
              <p className="text-xs text-muted-foreground">
                This batch will be created when the import starts.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNewBatchDialog(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmNewBatch} disabled={!newBatchDraft.trim()}>
              Create batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Import summary card ────────────────────────────────────────────────────
function ImportSummary({
  file,
  mapping,
  mappedFields,
}: {
  file: ParsedFile
  mapping: FieldMapping
  mappedFields: { col: string; label: string }[]
}) {
  const ignoredCount = Object.values(mapping).filter((v) => v === 'ignore').length
  const customCount = Object.values(mapping).filter((v) => v === 'custom').length

  return (
    <div className="grid grid-cols-3 gap-3">
      <SummaryCard
        label="Total rows"
        value={file.rowCount.toLocaleString()}
        sub="to be processed"
        icon={Users}
        color="blue"
      />
      <SummaryCard
        label="Columns mapped"
        value={mappedFields.length.toString()}
        sub={`${ignoredCount} skipped · ${customCount} custom`}
        icon={CheckCircle2}
        color="green"
      />
      <SummaryCard
        label="File size"
        value={formatBytes(file.size)}
        sub={file.name}
        icon={Layers}
        color="purple"
      />
    </div>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  sub: string
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'green' | 'purple'
}) {
  const colors = {
    blue:   'bg-secondary text-foreground',
    green:  'bg-secondary text-foreground',
    purple: 'bg-secondary text-foreground',
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
      <div className={cn('shrink-0 rounded-lg p-2', colors[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-bold leading-none">{value}</p>
        <p className="mt-1 truncate text-[10px] text-muted-foreground" title={sub}>{sub}</p>
      </div>
    </div>
  )
}

function DuplicateOption({
  value,
  current,
  title,
  description,
  icon: Icon,
  iconColor,
  onClick,
}: {
  value: 'skip' | 'update'
  current: 'skip' | 'update'
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  onClick: () => void
}) {
  const selected = value === current
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all duration-150',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-muted/40'
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconColor)} />
      <div>
        <p className={cn('text-sm font-semibold', selected && 'text-primary')}>{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {selected && (
        <div className="ml-auto shrink-0">
          <div className="h-4 w-4 rounded-full bg-primary" />
        </div>
      )}
    </button>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

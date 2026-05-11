'use client'

import { Users, CheckCircle2, AlertCircle, Layers, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ImportOptions, ExistingBatch, FieldMapping, ParsedFile } from './types'
import { CRM_FIELDS } from './types'

interface TeamMember { id: string; name: string }

interface OptionsStepProps {
  file:        ParsedFile
  mapping:     FieldMapping
  options:     ImportOptions
  batches:     ExistingBatch[]
  teamMembers: TeamMember[]
  onChange:    (options: ImportOptions) => void
}

export function OptionsStep({ file, mapping, options, batches, teamMembers, onChange }: OptionsStepProps) {
  const mappedFields = Object.entries(mapping)
    .filter(([, v]) => v !== 'ignore')
    .map(([col, field]) => ({
      col,
      label: CRM_FIELDS.find(f => f.value === field)?.label ?? field,
    }))

  const emailCol      = Object.entries(mapping).find(([, v]) => v === 'email')?.[0]
  const selectedBatch = batches.find(b => b.id === options.batchId)

  // Batch mode: '' = existing batch selected, 'new' = typing new name
  const batchMode = options.batchId === null ? 'new' : 'existing'

  return (
    <div className="space-y-8">
      {/* Import summary */}
      <ImportSummary file={file} mapping={mapping} mappedFields={mappedFields} />

      {/* ── Batch assignment ── */}
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">Assign to batch</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Group imported leads into a batch (e.g. HVAC, Access Control).
          </p>
        </div>

        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => onChange({ ...options, batchId: null, newBatchName: '' })}
              className={cn(
                'flex-1 px-4 py-2 text-sm font-medium transition-colors',
                batchMode === 'new'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              )}
            >
              New batch
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...options, batchId: batches[0]?.id ?? null, newBatchName: '' })}
              className={cn(
                'flex-1 px-4 py-2 text-sm font-medium transition-colors',
                batchMode === 'existing'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              )}
              disabled={batches.length === 0}
            >
              Existing batch
            </button>
          </div>

          {batchMode === 'new' ? (
            <div className="space-y-1.5">
              <Label htmlFor="new-batch-name">Batch name</Label>
              <Input
                id="new-batch-name"
                placeholder="e.g. HVAC Q3, Access Control — Chicago"
                value={options.newBatchName}
                onChange={e => onChange({ ...options, newBatchName: e.target.value, batchId: null })}
              />
              <p className="text-xs text-muted-foreground">
                A new batch with this name will be created when the import runs.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Select
                value={options.batchId ?? ''}
                onChange={e => onChange({ ...options, batchId: e.target.value || null, newBatchName: '' })}
              >
                <option value="">— Select batch —</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.leadCount.toLocaleString()} leads)
                  </option>
                ))}
              </Select>
              {selectedBatch && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="font-medium">{selectedBatch.name}</span>
                  <span className="text-muted-foreground">· {selectedBatch.leadCount.toLocaleString()} existing leads</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Assign to rep ── */}
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">Assign to rep</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Assign all imported leads to a specific rep so they appear in their leads view.
          </p>
        </div>

        <Select
          value={options.assignedTo ?? ''}
          onChange={e => onChange({ ...options, assignedTo: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {teamMembers.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>

        {options.assignedTo && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
            <UserRound className="h-4 w-4 text-primary" />
            <span>All imported leads will be assigned to <strong>{teamMembers.find(m => m.id === options.assignedTo)?.name}</strong></span>
          </div>
        )}
      </section>

      {/* ── Duplicate handling ── */}
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
            onClick={() => onChange({ ...options, duplicateMode: 'skip' })}
          />
          <DuplicateOption
            value="update"
            current={options.duplicateMode}
            title="Update existing"
            description="Overwrite the existing lead's fields with data from the import file."
            icon={AlertCircle}
            onClick={() => onChange({ ...options, duplicateMode: 'update' })}
          />
        </div>
      </section>

      {/* ── Ready summary ── */}
      <div className="rounded-xl border border-border bg-muted/30 p-5 text-sm space-y-2.5">
        <h3 className="font-semibold text-foreground">Ready to import</h3>
        <ul className="space-y-1.5 text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            <strong className="text-foreground">{file.rowCount.toLocaleString()}</strong> rows will be processed
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            <strong className="text-foreground">{mappedFields.length}</strong> columns mapped
            {emailCol && <> · email from <span className="font-medium text-primary">{emailCol}</span></>}
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            {options.batchId
              ? <>Add to <strong className="text-foreground">{selectedBatch?.name}</strong></>
              : options.newBatchName
                ? <>New batch <strong className="text-foreground">&ldquo;{options.newBatchName}&rdquo;</strong></>
                : <>Auto-named batch (by date)</>
            }
          </li>
          {options.assignedTo && (
            <li className="flex items-center gap-2">
              <span className="text-primary">✓</span>
              Assigned to <strong className="text-foreground">{teamMembers.find(m => m.id === options.assignedTo)?.name}</strong>
            </li>
          )}
          <li className="flex items-center gap-2">
            <span className="text-primary">✓</span>
            Duplicates will be <strong className="text-foreground">{options.duplicateMode === 'skip' ? 'skipped' : 'updated'}</strong>
          </li>
        </ul>
      </div>
    </div>
  )
}

// ── Import summary ────────────────────────────────────────────────────────
function ImportSummary({ file, mapping, mappedFields }: {
  file: ParsedFile; mapping: FieldMapping; mappedFields: { col: string; label: string }[]
}) {
  const ignoredCount = Object.values(mapping).filter(v => v === 'ignore').length
  const customCount  = Object.values(mapping).filter(v => v === 'custom').length

  return (
    <div className="grid grid-cols-3 gap-3">
      <SummaryCard label="Total rows"     value={file.rowCount.toLocaleString()} sub="to be processed"                  icon={Users}         />
      <SummaryCard label="Columns mapped" value={mappedFields.length.toString()} sub={`${ignoredCount} skipped · ${customCount} custom`} icon={CheckCircle2} />
      <SummaryCard label="File"           value={formatBytes(file.size)}         sub={file.name}                         icon={Layers}        />
    </div>
  )
}

function SummaryCard({ label, value, sub, icon: Icon }: {
  label: string; value: string; sub: string; icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
      <div className="shrink-0 rounded-lg bg-secondary p-2 text-foreground">
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

function DuplicateOption({ value, current, title, description, icon: Icon, onClick }: {
  value: 'skip' | 'update'; current: 'skip' | 'update'; title: string; description: string;
  icon: React.ComponentType<{ className?: string }>; onClick: () => void
}) {
  const selected = value === current
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all duration-150',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/40'
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className={cn('text-sm font-semibold', selected && 'text-primary')}>{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {selected && <div className="ml-auto shrink-0 h-4 w-4 rounded-full bg-primary" />}
    </button>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

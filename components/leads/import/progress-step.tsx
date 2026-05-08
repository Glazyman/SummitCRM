'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, XCircle, AlertTriangle, Download, ExternalLink,
  Users, MailCheck, AlertCircle, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { ImportResult } from './types'

type Phase = 'uploading' | 'processing' | 'done' | 'failed'

interface ProgressStepProps {
  /** Called to actually start the import. Returns the result when done. */
  onStart: () => Promise<ImportResult>
  onViewLeads: (batchId?: string) => void
  onImportAnother: () => void
}

export function ProgressStep({ onStart, onViewLeads, onImportAnother }: ProgressStepProps) {
  const [phase, setPhase] = useState<Phase>('uploading')
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('Uploading file…')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  // Guard against React Strict Mode double-invocation — ref persists across
  // the unmount/remount cycle so onStart() is called exactly once.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    async function run() {
      // Phase 1: Uploading (0 → 30%)
      setPhase('uploading')
      setStatusText('Uploading file to secure storage…')
      await animateTo(0, 30, 800, setProgress)

      // Phase 2: Processing (30 → 85%)
      setPhase('processing')
      setStatusText('Processing rows and checking for duplicates…')
      await animateTo(30, 85, 1200, setProgress)

      try {
        setStatusText('Almost done — inserting leads…')
        const res = await onStart()

        // Phase 3: Done (85 → 100%)
        await animateTo(85, 100, 400, setProgress)
        setResult(res)
        setPhase('done')
        setStatusText('Import complete!')
      } catch (err) {
        setPhase('failed')
        setError(err instanceof Error ? err.message : 'Import failed. Please try again.')
      }
    }

    run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Failed state ────────────────────────────────────────────────────────
  if (phase === 'failed') {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <XCircle className="h-8 w-8 text-destructive" />
        </div>
        <h3 className="text-xl font-semibold">Import failed</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {error ?? 'An unexpected error occurred while importing your leads.'}
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={onImportAnother}>
            Try again
          </Button>
          <Button asChild>
            <Link href="/leads">Go to Leads</Link>
          </Button>
        </div>
      </div>
    )
  }

  // ── In-progress state ────────────────────────────────────────────────────
  if (phase === 'uploading' || phase === 'processing') {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        {/* Animated icon */}
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </div>

        <h3 className="text-xl font-semibold">
          {phase === 'uploading' ? 'Uploading…' : 'Processing leads…'}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{statusText}</p>

        <div className="mt-8 w-full max-w-sm">
          <Progress
            value={progress}
            size="lg"
            color="default"
            label={statusText}
            animated
          />
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Large files may take a minute. Please don&apos;t close this page.
        </p>
      </div>
    )
  }

  // ── Done state ───────────────────────────────────────────────────────────
  const allSkipped   = result && result.imported === 0 && result.failed === 0 && result.skipped > 0
  const allFailed    = result && result.imported === 0 && result.failed > 0 && !allSkipped
  const partialSuccess = result && result.imported > 0 && result.failed > 0
  const fullSuccess  = result && result.failed === 0 && result.imported > 0

  return (
    <div className="space-y-8">
      {/* Hero result */}
      <div className="flex flex-col items-center py-6 text-center">
        <div className={cn(
          'mb-4 flex h-16 w-16 items-center justify-center rounded-full',
          allFailed  ? 'bg-destructive/10' : 'bg-secondary'
        )}>
          {allFailed
            ? <XCircle className="h-8 w-8 text-destructive" />
            : allSkipped
              ? <AlertTriangle className="h-8 w-8 text-foreground" />
              : partialSuccess
                ? <AlertTriangle className="h-8 w-8 text-foreground" />
                : <CheckCircle2 className="h-8 w-8 text-foreground" />
          }
        </div>

        <h3 className="text-2xl font-bold">
          {allFailed
            ? 'No leads imported'
            : allSkipped
              ? 'All leads already exist'
              : `${result!.imported.toLocaleString()} lead${result!.imported !== 1 ? 's' : ''} imported`
          }
        </h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {allSkipped
            ? `All ${result!.skipped} leads in this file already exist in your workspace. Switch to "Update existing" to overwrite their fields.`
            : fullSuccess
              ? 'All rows imported successfully.'
              : partialSuccess
                ? `${result!.failed.toLocaleString()} rows had errors and were skipped.`
                : 'All rows failed validation. Download the error report to investigate.'
          }
        </p>

        {/* Progress bar showing success ratio */}
        {result && result.total > 0 && (
          <div className="mt-4 w-full max-w-xs">
            <Progress
              value={result.imported}
              max={result.total}
              color={allFailed ? 'destructive' : fullSuccess ? 'success' : 'warning'}
              size="md"
              label={`${result.imported} of ${result.total} rows`}
            />
          </div>
        )}
      </div>

      {/* Stats grid */}
      {result && (
        <div className="grid grid-cols-3 gap-3">
          <ResultStat
            label="Imported"
            value={result.imported}
            color="emerald"
            icon={Users}
          />
          <ResultStat
            label="Already existed"
            value={result.skipped}
            color="blue"
            icon={MailCheck}
          />
          <ResultStat
            label="Errors"
            value={result.failed}
            color={result.failed > 0 ? 'red' : 'muted'}
            icon={AlertCircle}
          />
        </div>
      )}

      {/* Error report section — only for actual errors, not just skipped duplicates */}
      {result && result.errors.length > 0 && !allSkipped && (
        <div className="rounded-xl border border-border bg-secondary">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold text-foreground">
                {result.errors.length} rows need attention
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowErrors(!showErrors)}
                className="text-xs text-foreground underline underline-offset-2 hover:text-foreground"
              >
                {showErrors ? 'Hide' : 'View'} errors
              </button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 border-border text-xs text-foreground hover:bg-secondary"
                onClick={() => downloadErrors(result.errors)}
              >
                <Download className="h-3 w-3" />
                Download report
              </Button>
            </div>
          </div>

          {/* Inline error list */}
          {showErrors && (
            <div className="border-t border-border">
              <div className="max-h-48 overflow-y-auto divide-y divide-amber-100">
                {result.errors.slice(0, 50).map((err, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5 text-xs">
                    <span className="w-12 shrink-0 text-foreground">
                      Row {err.row}
                    </span>
                    <span className="min-w-0 truncate font-mono text-foreground">
                      {err.email}
                    </span>
                    <span className="ml-auto shrink-0 text-foreground">
                      {err.reason}
                    </span>
                  </div>
                ))}
                {result.errors.length > 50 && (
                  <div className="px-4 py-2.5 text-center text-xs text-foreground">
                    + {result.errors.length - 50} more errors. Download report for full list.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onImportAnother}>
          Import another file
        </Button>
        <Button onClick={() => onViewLeads(result?.batchId)}>
          View imported leads <ArrowRight className="h-4 w-4" />
          {result?.batchName && (
            <span className="ml-1 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-xs">
              {result.batchName}
            </span>
          )}
        </Button>
      </div>
    </div>
  )
}

// ── Result stat card ─────────────────────────────────────────────────────
function ResultStat({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string
  value: number
  color: 'emerald' | 'blue' | 'red' | 'muted'
  icon: React.ComponentType<{ className?: string }>
}) {
  const styles = {
    emerald: { bg: 'bg-secondary', text: 'text-foreground', val: 'text-foreground' },
    blue:    { bg: 'bg-secondary',    text: 'text-foreground',    val: 'text-foreground' },
    red:     { bg: 'bg-secondary',      text: 'text-foreground',      val: 'text-foreground' },
    muted:   { bg: 'bg-muted',                           text: 'text-muted-foreground',               val: 'text-muted-foreground' },
  }
  const s = styles[color]

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/20 p-4 text-center">
      <div className={cn('rounded-lg p-2', s.bg)}>
        <Icon className={cn('h-4 w-4', s.text)} />
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', s.val)}>
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function animateTo(
  from: number,
  to: number,
  durationMs: number,
  onValue: (v: number) => void
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now()
    function tick(now: number) {
      const t = Math.min((now - start) / durationMs, 1)
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t // ease-in-out
      onValue(Math.round(from + (to - from) * eased))
      if (t < 1) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
}

function downloadErrors(errors: { row: number; email: string; reason: string }[]) {
  const header = 'Row,Email,Reason\n'
  const rows = errors.map((e) => `${e.row},"${e.email}","${e.reason}"`).join('\n')
  const csv = header + rows
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `import-errors-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

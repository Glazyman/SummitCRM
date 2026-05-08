'use client'

import { useRef, useState, useCallback } from 'react'
import { UploadCloud, FileSpreadsheet, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ParsedFile } from './types'

// ── File parsers ──────────────────────────────────────────────────────────

async function parseCSV(file: File): Promise<ParsedFile> {
  const Papa = (await import('papaparse')).default

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      preview: 1001, // parse first 1001 rows for preview (1 header + 1000 data rows)
      complete: (results) => {
        const data = results.data as Record<string, string>[]
        const headers = results.meta.fields ?? []
        if (headers.length === 0) {
          reject(new Error('No column headers found. Ensure your CSV has a header row.'))
          return
        }
        if (data.length === 0) {
          reject(new Error('The file appears to be empty.'))
          return
        }
        resolve({
          name: file.name,
          size: file.size,
          rowCount: data.length,
          headers,
          preview: data.slice(0, 5),
          rawData: data,
        })
      },
      error: (error) => reject(new Error(error.message)),
    })
  })
}

async function parseXLSX(file: File): Promise<ParsedFile> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })

  if (data.length === 0) throw new Error('The file appears to be empty.')

  const headers = Object.keys(data[0])
  if (headers.length === 0) throw new Error('No column headers found.')

  return {
    name: file.name,
    size: file.size,
    rowCount: data.length,
    headers,
    preview: data.slice(0, 5) as Record<string, string>[],
    rawData: data as Record<string, string>[],
  }
}

async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv' || file.type === 'text/csv') return parseCSV(file)
  if (ext === 'xlsx' || ext === 'xls') return parseXLSX(file)
  throw new Error('Unsupported file type. Please upload a .csv or .xlsx file.')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Component ──────────────────────────────────────────────────────────────
interface UploadZoneProps {
  onFileParsed: (file: ParsedFile) => void
}

export function UploadZone({ onFileParsed }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const ACCEPTED = '.csv,.xlsx,.xls'
  const MAX_SIZE_MB = 25

  async function processFile(file: File) {
    setError(null)
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File is too large. Maximum allowed size is ${MAX_SIZE_MB} MB.`)
      return
    }

    setParsing(true)
    try {
      const result = await parseFile(file)
      setParsed(result)
      onFileParsed(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file.')
    } finally {
      setParsing(false)
    }
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) await processFile(file)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleRemove() {
    setParsed(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Parsed success state ─────────────────────────────────────────────
  if (parsed) {
    return (
      <div className="rounded-xl border border-border bg-secondary p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <FileSpreadsheet className="h-6 w-6 text-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="truncate font-semibold text-foreground">{parsed.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formatBytes(parsed.size)} · {parsed.headers.length} columns detected
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemove}
                className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-foreground" />
              <span className="text-sm font-medium text-foreground">
                {parsed.rowCount.toLocaleString()} rows ready to import
              </span>
            </div>

            {/* Column preview chips */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {parsed.headers.slice(0, 8).map((h) => (
                <span
                  key={h}
                  className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {h}
                </span>
              ))}
              {parsed.headers.length > 8 && (
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  +{parsed.headers.length - 8} more
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Drop zone ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div
        className={cn(
          'relative flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-150',
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50',
          parsing && 'pointer-events-none opacity-60'
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        aria-label="Upload file"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={handleFileChange}
          tabIndex={-1}
        />

        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Parsing file…</p>
          </div>
        ) : (
          <>
            <div className={cn(
              'mb-4 flex h-14 w-14 items-center justify-center rounded-full transition-all',
              isDragging ? 'bg-primary/10' : 'bg-muted'
            )}>
              <UploadCloud className={cn(
                'h-7 w-7 transition-colors',
                isDragging ? 'text-primary' : 'text-muted-foreground'
              )} />
            </div>

            <p className="text-base font-medium">
              {isDragging ? 'Drop to upload' : 'Drag & drop your file here'}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              or{' '}
              <span className="font-medium text-primary">browse to choose a file</span>
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Supports .csv and .xlsx · Max {MAX_SIZE_MB} MB · Up to 10,000 rows
            </p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/8 px-3.5 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Download template link */}
      <div className="flex items-center justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation()
            downloadTemplate()
          }}
        >
          Download CSV template
        </Button>
      </div>
    </div>
  )
}

// ── CSV template download ─────────────────────────────────────────────────
function downloadTemplate() {
  const headers = ['first_name', 'last_name', 'email', 'company', 'title', 'phone', 'website', 'linkedin_url']
  const csv = `${headers.join(',')}\n`
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'summits-crm-leads-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

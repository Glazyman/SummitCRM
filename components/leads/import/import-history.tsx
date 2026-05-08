'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, XCircle, Clock, Download, ExternalLink,
  ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export interface ImportRecord {
  id: string
  fileName: string
  status: 'processing' | 'complete' | 'failed'
  totalRows: number
  importedRows: number
  failedRows: number
  batchName?: string
  batchId?: string
  createdAt: string
  completedAt?: string
  hasErrors: boolean
}

interface ImportHistoryProps {
  records: ImportRecord[]
  loading?: boolean
  onRefresh?: () => void
}

const STATUS_CONFIG = {
  processing: {
    label: 'Processing',
    variant: 'secondary' as const,
    icon: Clock,
    iconClass: 'text-foreground animate-spin',
  },
  complete: {
    label: 'Complete',
    variant: 'default' as const,
    icon: CheckCircle2,
    iconClass: 'text-foreground',
  },
  failed: {
    label: 'Failed',
    variant: 'destructive' as const,
    icon: XCircle,
    iconClass: 'text-destructive',
  },
}

export function ImportHistory({ records, loading, onRefresh }: ImportHistoryProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No imports yet</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Your import history will appear here after your first upload.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="hidden grid-cols-[1fr_100px_80px_80px_80px_120px_80px] items-center gap-4 px-4 py-2 md:grid">
        {['File', 'Status', 'Total', 'Imported', 'Failed', 'Batch', 'Actions'].map((h) => (
          <p key={h} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {h}
          </p>
        ))}
      </div>

      {records.map((rec) => {
        const cfg = STATUS_CONFIG[rec.status]
        const StatusIcon = cfg.icon
        const isExpanded = expanded === rec.id
        const successRate = rec.totalRows > 0
          ? Math.round((rec.importedRows / rec.totalRows) * 100)
          : 0

        return (
          <div
            key={rec.id}
            className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-muted/20"
          >
            {/* Main row */}
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_100px_80px_80px_80px_120px_80px] md:items-center md:gap-4">
              {/* File info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                  'shrink-0 rounded-lg p-2',
                  rec.status === 'complete' ? 'bg-secondary'
                    : rec.status === 'failed' ? 'bg-destructive/10'
                    : 'bg-secondary'
                )}>
                  <StatusIcon className={cn('h-4 w-4', cfg.iconClass)} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{rec.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelative(rec.createdAt)}
                    {rec.completedAt && rec.status === 'complete' && (
                      <> · took {formatDuration(rec.createdAt, rec.completedAt)}</>
                    )}
                  </p>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2">
                <Badge variant={cfg.variant} className="text-xs">
                  {cfg.label}
                </Badge>
              </div>

              {/* Counts */}
              <p className="text-sm tabular-nums">{rec.totalRows.toLocaleString()}</p>

              <p className={cn(
                'text-sm font-medium tabular-nums',
                rec.importedRows > 0 ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {rec.importedRows.toLocaleString()}
              </p>

              <p className={cn(
                'text-sm tabular-nums',
                rec.failedRows > 0 ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {rec.failedRows.toLocaleString()}
              </p>

              {/* Batch */}
              <div>
                {rec.batchId ? (
                  <Link
                    href={`/leads?batch=${rec.batchId}`}
                    className="flex items-center gap-1 truncate text-xs text-primary hover:underline"
                  >
                    {rec.batchName}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5">
                {rec.hasErrors && rec.status !== 'processing' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    title="Download error report"
                    onClick={() => downloadErrorReport(rec.id)}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                  onClick={() => setExpanded(isExpanded ? null : rec.id)}
                >
                  {isExpanded
                    ? <ChevronUp className="h-3.5 w-3.5" />
                    : <ChevronDown className="h-3.5 w-3.5" />
                  }
                </Button>
              </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border bg-muted/20 px-4 py-4">
                {/* Progress bar */}
                {rec.totalRows > 0 && (
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Import success rate</span>
                      <span className="font-medium">{successRate}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-secondary transition-all"
                        style={{ width: `${successRate}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Detail grid */}
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <DetailItem label="File" value={rec.fileName} />
                  <DetailItem label="Started" value={formatDate(rec.createdAt)} />
                  <DetailItem label="Completed" value={rec.completedAt ? formatDate(rec.completedAt) : '—'} />
                  <DetailItem
                    label="Batch"
                    value={rec.batchName ?? 'None'}
                    href={rec.batchId ? `/leads?batch=${rec.batchId}` : undefined}
                  />
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  {rec.batchId && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/leads?batch=${rec.batchId}`}>
                        View leads <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  )}
                  {rec.hasErrors && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadErrorReport(rec.id)}
                    >
                      <Download className="h-3 w-3" />
                      Error report
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Refresh button */}
      {onRefresh && (
        <div className="flex justify-center pt-2">
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function DetailItem({
  label,
  value,
  href,
}: {
  label: string
  value: string
  href?: string
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {href ? (
        <Link href={href} className="mt-0.5 text-sm font-medium text-primary hover:underline">
          {value}
        </Link>
      ) : (
        <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
      )}
    </div>
  )
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(dateStr)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function downloadErrorReport(importId: string) {
  // In production: fetch from /api/leads/import/{importId}/errors
  window.location.href = `/api/leads/import/${importId}/errors`
}

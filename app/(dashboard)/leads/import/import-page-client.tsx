'use client'

import { useState, useCallback } from 'react'
import { History, Upload }       from 'lucide-react'
import { ImportWizard }   from '@/components/leads/import/import-wizard'
import { ImportHistory }  from '@/components/leads/import/import-history'
import { BatchComparisonTable } from '@/components/analytics'
import { cn }             from '@/lib/utils'
import type {
  ExistingBatch, ParsedFile, FieldMapping, ImportOptions, ImportResult, CustomFieldNames,
} from '@/components/leads/import/types'
import type { ImportRecord } from '@/components/leads/import/import-history'
import type { BatchRow } from '@/components/analytics'

interface ImportPageClientProps {
  batches:        ExistingBatch[]
  teamMembers:    { id: string; name: string }[]
  isAdmin:        boolean
  currentUserId:  string
}

type Tab = 'import' | 'history'

export function ImportPageClient({ batches, teamMembers, isAdmin, currentUserId }: ImportPageClientProps) {
  const [activeTab, setActiveTab]       = useState<Tab>('import')
  const [historyRecords, setHistoryRecords] = useState<ImportRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // Batch stats (moved here from the Analytics page) — shown alongside history.
  const [batchStats, setBatchStats]         = useState<BatchRow[]>([])
  const [batchStatsLoading, setBatchStatsLoading] = useState(false)

  // ── Real import handler ──────────────────────────────────────────────────
  async function handleImport({
    file,
    mapping,
    customFieldNames,
    options,
  }: {
    file:             ParsedFile
    mapping:          FieldMapping
    customFieldNames: CustomFieldNames
    options:          ImportOptions
  }): Promise<ImportResult> {
    // Only send the columns that are actually mapped (not ignored).
    // This strips all unmapped/ignored CSV columns before sending,
    // which can reduce the payload by 80%+ for files with many columns.
    const mappedColumns = Object.entries(mapping)
      .filter(([, field]) => field !== 'ignore')
      .map(([col]) => col)
    const strippedRows = file.rawData.map((row) => {
      const lean: Record<string, string> = {}
      for (const col of mappedColumns) {
        if (col in row) lean[col] = row[col]
      }
      return lean
    })

    const res = await fetch('/api/leads/import/start', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows:             strippedRows,
        mapping,
        customFieldNames,
        batchId:          options.batchId ?? null,
        newBatchName:     options.newBatchName,
        duplicateMode:    options.duplicateMode,
        assignedTo:       options.assignedTo ?? null,
        fileName:         file.name,
      }),
    })

    const json = await res.json() as {
      data?: {
        importId:   string
        total:      number
        imported:   number
        updated:    number
        skipped:    number
        failed:     number
        batchId:    string | null
        batchName:  string
        errors:     Array<{ row: number; email: string; reason: string }>
      }
      error?: string
    }

    if (!res.ok || json.error) {
      throw new Error(json.error ?? `Import failed (HTTP ${res.status})`)
    }

    const d = json.data!
    return {
      importId:  d.importId,
      total:     d.total,
      imported:  d.imported + d.updated,
      skipped:   d.skipped,
      failed:    d.failed,
      errors:    d.errors,
      batchId:   d.batchId ?? undefined,
      batchName: d.batchName || undefined,
    }
  }

  // ── Fetch import history ─────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res  = await fetch('/api/leads/imports?limit=50')
      const json = await res.json() as {
        data?: {
          items: Array<{
            id:           string
            fileName:     string
            status:       string
            totalRows:    number
            importedRows: number
            failedRows:   number
            batch:        { id: string; name: string } | null
            createdAt:    string
            completedAt:  string | null
            hasErrors:    boolean
          }>
        }
        error?: string
      }

      if (json.data?.items) {
        const records: ImportRecord[] = json.data.items.map((item) => ({
          id:          item.id,
          fileName:    item.fileName,
          status:      item.status as ImportRecord['status'],
          totalRows:   item.totalRows,
          importedRows: item.importedRows,
          failedRows:  item.failedRows,
          batchName:   item.batch?.name,
          batchId:     item.batch?.id,
          createdAt:   item.createdAt,
          completedAt:
            item.status !== 'processing' && item.completedAt
              ? item.completedAt
              : undefined,
          hasErrors:   item.hasErrors,
        }))
        setHistoryRecords(records)
      }
    } catch (err) {
      console.error('[ImportHistory] fetch failed:', err)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  // ── Fetch batch stats ────────────────────────────────────────────────────
  const fetchBatchStats = useCallback(async () => {
    setBatchStatsLoading(true)
    try {
      const res = await fetch('/api/analytics/batches')
      if (res.ok) { const d = await res.json(); setBatchStats(d.batches ?? []) }
    } catch (err) {
      console.error('[Batches] fetch failed:', err)
    } finally {
      setBatchStatsLoading(false)
    }
  }, [])

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    if (tab === 'history') { fetchHistory(); fetchBatchStats() }
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex rounded-xl border border-border bg-muted/40 p-1 w-fit">
        <TabButton
          active={activeTab === 'import'}
          icon={Upload}
          label="New Import"
          onClick={() => handleTabChange('import')}
        />
        <TabButton
          active={activeTab === 'history'}
          icon={History}
          label="Import History"
          onClick={() => handleTabChange('history')}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'import' ? (
        <ImportWizard
          batches={batches}
          teamMembers={teamMembers}
          onImport={handleImport}
        />
      ) : (
        <div className="space-y-8">
          {/* Import History */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Import History</h2>
              <p className="text-sm text-muted-foreground">
                All lead imports for your workspace. Expand any row to see details.
              </p>
            </div>
            <ImportHistory
              records={historyRecords}
              loading={historyLoading}
              onRefresh={fetchHistory}
            />
          </div>

          {/* Batches (moved here from Analytics) */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Batches</h2>
              <p className="text-sm text-muted-foreground">
                Every lead batch in your workspace. Expand a batch to see its leads.
              </p>
            </div>
            <BatchComparisonTable
              batches={batchStats}
              loading={batchStatsLoading}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onDelete={id => setBatchStats(prev => prev.filter(b => b.id !== id))}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

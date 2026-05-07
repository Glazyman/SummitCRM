'use client'

import { useState, useCallback } from 'react'
import { History, Upload }       from 'lucide-react'
import { ImportWizard }   from '@/components/leads/import/import-wizard'
import { ImportHistory }  from '@/components/leads/import/import-history'
import { cn }             from '@/lib/utils'
import type {
  ExistingBatch, ParsedFile, FieldMapping, ImportOptions, ImportResult,
} from '@/components/leads/import/types'
import type { ImportRecord } from '@/components/leads/import/import-history'

interface ImportPageClientProps {
  batches: ExistingBatch[]
}

type Tab = 'import' | 'history'

export function ImportPageClient({ batches }: ImportPageClientProps) {
  const [activeTab, setActiveTab]       = useState<Tab>('import')
  const [historyRecords, setHistoryRecords] = useState<ImportRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // ── Real import handler ──────────────────────────────────────────────────
  async function handleImport({
    file,
    mapping,
    options,
  }: {
    file:    ParsedFile
    mapping: FieldMapping
    options: ImportOptions
  }): Promise<ImportResult> {
    const res = await fetch('/api/leads/import/start', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows:          file.rawData,
        mapping,
        batchId:       options.batchId ?? null,
        newBatchName:  options.newBatchName,
        duplicateMode: options.duplicateMode,
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
            status:       string
            totalRows:    number
            importedRows: number
            failedRows:   number
            batch:        { id: string; name: string } | null
            createdAt:    string
            updatedAt:    string
            hasErrors:    boolean
          }>
        }
        error?: string
      }

      if (json.data?.items) {
        const records: ImportRecord[] = json.data.items.map((item) => ({
          id:          item.id,
          fileName:    `import-${item.id.slice(0, 8)}`,
          status:      item.status as ImportRecord['status'],
          totalRows:   item.totalRows,
          importedRows: item.importedRows,
          failedRows:  item.failedRows,
          batchName:   item.batch?.name,
          batchId:     item.batch?.id,
          createdAt:   item.createdAt,
          completedAt: item.status !== 'processing' ? item.updatedAt : undefined,
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

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    if (tab === 'history') fetchHistory()
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
          onImport={handleImport}
        />
      ) : (
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

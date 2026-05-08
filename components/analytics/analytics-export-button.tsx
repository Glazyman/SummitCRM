'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Check } from 'lucide-react'
import type { AnalyticsTab } from './types'

interface Props {
  view:   AnalyticsTab
  start?: string
  end?:   string
}

export function AnalyticsExportButton({ view, start, end }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [done,        setDone]        = useState(false)

  const handleExport = async () => {
    setDownloading(true)
    try {
      const params = new URLSearchParams({ view })
      if (start) params.set('start', start)
      if (end)   params.set('end',   end)
      const res  = await fetch(`/api/analytics/export?${params.toString()}`)
      if (!res.ok) { alert('Export failed'); return }
      const blob = await res.blob()
      const cd   = res.headers.get('Content-Disposition') ?? ''
      const name = cd.match(/filename="([^"]+)"/)?.[1] ?? `analytics-${view}.csv`
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
      setDone(true)
      setTimeout(() => setDone(false), 2500)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={downloading}
      className="gap-2 h-9"
    >
      {done
        ? <><Check className="h-3.5 w-3.5 text-foreground" /> Exported</>
        : <><Download className="h-3.5 w-3.5" /> Export CSV</>
      }
    </Button>
  )
}

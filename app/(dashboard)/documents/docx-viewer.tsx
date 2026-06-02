'use client'

import 'superdoc/style.css'
import * as React from 'react'
import { Spinner } from '@/components/ui/spinner'

/** Read-only .docx renderer (SuperDoc in viewing mode), used inside the popup. */
export default function DocxViewer({ docId }: { docId: string }) {
  const elRef = React.useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instRef = React.useRef<any>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let destroyed = false
    ;(async () => {
      try {
        const mod = await import('superdoc')
        if (destroyed || !elRef.current) return
        const SuperDoc = (mod as { SuperDoc: new (opts: unknown) => unknown }).SuperDoc
        instRef.current = new SuperDoc({
          selector: elRef.current,
          document: `/api/documents/${docId}/raw`,
          documentMode: 'viewing',
          onReady: () => { if (!destroyed) setReady(true) },
        })
      } catch { /* surfaced by parent via the download fallback */ }
    })()
    return () => {
      destroyed = true
      try { instRef.current?.destroy?.() } catch { /* noop */ }
      instRef.current = null
    }
  }, [docId])

  return (
    <div className="relative max-h-[72vh] w-full overflow-y-auto bg-white">
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
          <Spinner />
        </div>
      )}
      <div ref={elRef} className="min-h-[72vh] w-full" />
    </div>
  )
}

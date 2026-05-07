'use client'

/**
 * components/ai/batch-personalisation-status.tsx
 *
 * BatchPersonalisationStatus — shown in the Campaign builder (Step 2)
 * when a campaign step has use_ai = true.
 *
 * Pre-launch: shows cost estimate and lead count.
 * Post-launch: polls /api/ai/batch-personalise/[jobId] every 3s
 *              and shows a live progress bar.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Button }    from '@/components/ui/button'
import { Badge }     from '@/components/ui/badge'
import { Progress }  from '@/components/ui/progress'
import {
  Sparkles, RefreshCw, CheckCircle, XCircle, AlertCircle, Play,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BatchPersonalisationStatusProps {
  campaignId:  string
  stepNumber:  number
  leadCount:   number
  jobId?:      string           // set after job is created
  onJobStart:  (jobId: string) => void
  className?:  string
}

interface JobStatus {
  id:           string
  status:       'pending' | 'running' | 'completed' | 'failed'
  total:        number
  processed:    number
  failed_count: number
  progress_pct: number
  error:        string | null
  completed_at: string | null
}

const POLL_INTERVAL = 3000   // 3s

function estimateCost(leads: number): string {
  const tokens = leads * 600
  const cost   = (tokens / 1_000_000) * 0.15
  return cost < 0.01 ? '<$0.01' : `~$${cost.toFixed(2)}`
}

export function BatchPersonalisationStatus({
  campaignId, stepNumber, leadCount, jobId: initialJobId,
  onJobStart, className,
}: BatchPersonalisationStatusProps) {
  const [jobId,    setJobId]   = useState<string | null>(initialJobId ?? null)
  const [status,   setStatus]  = useState<JobStatus | null>(null)
  const [starting, setStarting]= useState(false)
  const [error,    setError]   = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  // ── Start polling when we have a jobId ─────────────────────────────────
  useEffect(() => {
    if (!jobId) return

    const poll = async () => {
      try {
        const res  = await fetch(`/api/ai/batch-personalise/${jobId}`)
        const data = await res.json() as JobStatus
        setStatus(data)

        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollRef.current)
        }
      } catch {}
    }

    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [jobId])

  const handleStart = async () => {
    setStarting(true)
    setError(null)
    try {
      const res  = await fetch('/api/ai/batch-personalise', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ campaign_id: campaignId, step_number: stepNumber }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to start batch')
        return
      }
      setJobId(data.job_id)
      onJobStart(data.job_id)
    } catch {
      setError('Request failed')
    } finally {
      setStarting(false)
    }
  }

  // ── Pre-launch (no job yet) ──────────────────────────────────────────────
  if (!jobId) {
    return (
      <div className={cn(
        'rounded-lg border border-purple-200 dark:border-purple-800 p-4',
        'bg-purple-50/50 dark:bg-purple-950/20 space-y-3',
        className,
      )}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium">AI Personalisation</span>
          <Badge variant="outline" className="text-xs ml-auto">
            Step {stepNumber}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          AI will generate a unique, personalised email for each of the{' '}
          <strong>{leadCount.toLocaleString()}</strong> leads in this campaign.
        </p>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Estimated cost: <strong>{estimateCost(leadCount)}</strong>
          </span>
          <span className="text-muted-foreground text-xs">
            Using gpt-4o-mini
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-xs">
            <AlertCircle className="h-3 w-3" /> {error}
          </div>
        )}

        <Button
          onClick={handleStart}
          disabled={starting}
          size="sm"
          className="w-full gap-2"
        >
          {starting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {starting ? 'Starting…' : 'Start AI Personalisation'}
        </Button>
      </div>
    )
  }

  // ── Progress / complete / failed ─────────────────────────────────────────
  const pct     = status?.progress_pct ?? 0
  const isDone  = status?.status === 'completed'
  const isFail  = status?.status === 'failed'

  return (
    <div className={cn(
      'rounded-lg border p-4 space-y-3',
      isDone  ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20' :
      isFail  ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20' :
                'border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20',
      className,
    )}>
      <div className="flex items-center gap-2">
        {isDone ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : isFail ? (
          <XCircle className="h-4 w-4 text-red-500" />
        ) : (
          <Sparkles className="h-4 w-4 text-purple-500" />
        )}
        <span className="text-sm font-medium">
          {isDone ? 'Personalisation complete' :
           isFail ? 'Personalisation failed' :
                    'Personalising emails…'}
        </span>
        <Badge variant="outline" className="text-xs ml-auto">
          Step {stepNumber}
        </Badge>
      </div>

      {!isDone && !isFail && (
        <>
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">
            {status?.processed ?? 0} / {status?.total ?? leadCount} leads processed ({pct}%)
          </p>
        </>
      )}

      {isDone && (
        <p className="text-sm text-green-700 dark:text-green-300">
          {status?.processed} emails personalised.
          {(status?.failed_count ?? 0) > 0 && (
            <span className="text-orange-600 dark:text-orange-400 ml-1">
              {status?.failed_count} failed.
            </span>
          )}
        </p>
      )}

      {isFail && (
        <div className="space-y-2">
          <p className="text-sm text-red-600 dark:text-red-400">
            {status?.error ?? 'Unknown error'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setJobId(null); setStatus(null) }}
          >
            Try Again
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * GET /api/ai/batch-personalise/[jobId]
 *
 * Polls the status of a batch AI personalisation job.
 * Used by the frontend to show real-time progress.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _req:    Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId }   = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminClient = createAdminClient()

    const { data: member } = await adminClient
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['manager', 'admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Manager or admin role required' }, { status: 403 })
    }

    const { data: job } = await adminClient
      .from('ai_batch_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('workspace_id', member.workspace_id)
      .single() as {
        data: {
          id: string; campaign_id: string; step_number: number
          status: string; total: number; processed: number; failed_count: number
          error: string | null; started_at: string | null; completed_at: string | null; created_at: string
        } | null
      }

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0

    return NextResponse.json({
      id:           job.id,
      campaign_id:  job.campaign_id,
      step_number:  job.step_number,
      status:       job.status,
      total:        job.total,
      processed:    job.processed,
      failed_count: job.failed_count,
      progress_pct: pct,
      // Sanitize error: only return a generic message to avoid internal detail leakage
      error:        job.error ? 'Job encountered an error. Contact your administrator.' : null,
      started_at:   job.started_at,
      completed_at: job.completed_at,
    })
  } catch (err) {
    console.error('[GET /api/ai/batch-personalise/[jobId]]', err)
    return NextResponse.json({ error: 'Failed to fetch job status.' }, { status: 500 })
  }
}

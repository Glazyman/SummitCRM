import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
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

    // Verify campaign belongs to workspace
    const { data: campaign } = await adminClient
      .from('campaigns')
      .select('id, total_leads, emails_sent, emails_opened, emails_clicked, emails_replied, emails_bounced')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .single() as {
        data: {
          id: string; total_leads: number; emails_sent: number
          emails_opened: number; emails_clicked: number
          emails_replied: number; emails_bounced: number
        } | null
      }

    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Per-step breakdown
    const { data: steps } = await adminClient
      .from('campaign_sequence_steps')
      .select('step_number, subject_template')
      .eq('campaign_id', id)
      .order('step_number') as { data: Array<{ step_number: number; subject_template: string }> | null }

    // Count emails per step per status
    const { data: emailStats } = await adminClient
      .from('emails')
      .select('step_number, status, opened_at, clicked_at, replied_at, bounced_at')
      .eq('campaign_id', id) as { data: Array<{
        step_number: number | null; status: string
        opened_at: string | null; clicked_at: string | null
        replied_at: string | null; bounced_at: string | null
      }> | null }

    const emailRows = emailStats ?? []
    const totalEmails = emailRows.length

    // Build per-step analytics
    const byStep = (steps ?? []).map((step) => {
      const stepEmails = emailRows.filter((e) => e.step_number === step.step_number)
      const sent    = stepEmails.filter((e) => ['sent', 'opened', 'clicked', 'replied', 'bounced'].includes(e.status)).length
      const opened  = stepEmails.filter((e) => e.opened_at).length
      const clicked = stepEmails.filter((e) => e.clicked_at).length
      const replied = stepEmails.filter((e) => e.replied_at).length
      const bounced = stepEmails.filter((e) => e.bounced_at).length
      return {
        step_number: step.step_number,
        subject:     step.subject_template,
        sent, opened, clicked, replied, bounced,
      }
    })

    // Emails by day (last 30 days)
    const { data: dailyRaw } = await adminClient
      .from('emails')
      .select('sent_at, opened_at')
      .eq('campaign_id', id)
      .not('sent_at', 'is', null) as {
        data: Array<{ sent_at: string | null; opened_at: string | null }> | null
      }

    const dailyMap = new Map<string, { sent: number; opens: number }>()
    for (const row of (dailyRaw ?? [])) {
      if (!row.sent_at) continue
      const day = row.sent_at.slice(0, 10)
      const existing = dailyMap.get(day) ?? { sent: 0, opens: 0 }
      existing.sent++
      if (row.opened_at) existing.opens++
      dailyMap.set(day, existing)
    }
    const byDay = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }))

    const sent       = campaign.emails_sent
    const pct = (n: number) => sent > 0 ? Math.round((n / sent) * 1000) / 10 : 0

    return NextResponse.json({
      analytics: {
        total_leads:      campaign.total_leads,
        total_emails:     totalEmails,
        sent,
        failed:    emailRows.filter((e) => e.status === 'failed').length,
        queued:    emailRows.filter((e) => e.status === 'queued').length,
        open_rate:        pct(campaign.emails_opened),
        click_rate:       pct(campaign.emails_clicked),
        reply_rate:       pct(campaign.emails_replied),
        bounce_rate:      pct(campaign.emails_bounced),
        unsubscribe_rate: 0,
        by_step:          byStep,
        by_day:           byDay,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

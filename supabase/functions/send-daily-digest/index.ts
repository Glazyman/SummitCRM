import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendApiKey   = Deno.env.get('RESEND_API_KEY')!
const appUrl         = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://summitscrm.com'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase  = createClient(supabaseUrl, serviceRoleKey)
  const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString()
  const today     = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Fetch all active workspace members who have any email_digest enabled
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id, workspace_id, auth.users!inner(email)')
    .eq('status', 'active')

  let sent = 0, skipped = 0

  for (const member of members ?? []) {
    const userEmail = (member as { ['auth.users']: { email: string } })['auth.users']?.email
    if (!userEmail) { skipped++; continue }

    // Check if user wants email digest for at least one type
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('type, email_digest')
      .eq('user_id', member.user_id)
      .eq('workspace_id', member.workspace_id)

    const digestTypes = new Set(
      (prefs ?? [])
        .filter((p: { email_digest: boolean }) => p.email_digest)
        .map((p: { type: string }) => p.type)
    )
    // If no prefs saved, default is all enabled — proceed
    const allDefault = !prefs || prefs.length === 0

    // Fetch unread notifications from last 24h
    const { data: notifs } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', member.user_id)
      .eq('is_read', false)
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false })
      .limit(20)

    const relevantNotifs = (notifs ?? []).filter((n: { type: string }) =>
      allDefault || digestTypes.has(n.type)
    )

    // Fetch follow-ups due today
    const todayStr = new Date().toISOString().slice(0, 10)
    const { data: followUps } = await supabase
      .from('follow_ups')
      .select('id, notes, due_at, leads!inner(id, first_name, last_name)')
      .eq('leads.assigned_to', member.user_id)
      .gte('due_at', `${todayStr}T00:00:00Z`)
      .lt('due_at', `${todayStr}T23:59:59Z`)
      .is('completed_at', null)
      .limit(10)

    // Fetch yesterday's activity stats
    const { count: emailsSent } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', member.user_id)
      .gte('created_at', yesterday)

    const { count: repliesReceived } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', member.user_id)
      .eq('status', 'replied')
      .gte('updated_at', yesterday)

    // Skip if nothing to report
    const hasContent = relevantNotifs.length > 0 || (followUps?.length ?? 0) > 0
    if (!hasContent) { skipped++; continue }

    // Build digest email HTML
    const html = buildDigestHtml({
      today,
      appUrl,
      followUps: (followUps ?? []).map((f: { leads: { id: string; first_name: string | null; last_name: string | null }; notes: string | null }) => ({
        name: [f.leads?.first_name, f.leads?.last_name].filter(Boolean).join(' ') || 'Unknown',
        id:   f.leads?.id ?? '',
        notes: f.notes ?? '',
      })),
      notifs: relevantNotifs,
      stats: {
        emailsSent:      emailsSent ?? 0,
        repliesReceived: repliesReceived ?? 0,
      },
    })

    // Send via Resend
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'Summits CRM <digest@summitscrm.com>',
        to:      userEmail,
        subject: `Your Summits CRM Daily Summary — ${today}`,
        html,
      }),
    })

    if (sendRes.ok) { sent++ } else { skipped++ }
  }

  console.log(`send-daily-digest: ${sent} sent, ${skipped} skipped`)
  return new Response(JSON.stringify({ sent, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── HTML builder ────────────────────────────────────────────────────────────
function buildDigestHtml(data: {
  today:     string
  appUrl:    string
  followUps: { name: string; id: string; notes: string }[]
  notifs:    { type: string; title: string; body: string | null; link: string | null }[]
  stats:     { emailsSent: number; repliesReceived: number }
}) {
  const replies  = data.notifs.filter(n => n.type === 'reply_received')
  const bounces  = data.notifs.filter(n => n.type === 'bounce')
  const alerts   = data.notifs.filter(n => ['quota_warning', 'ai_budget_warning', 'ai_budget_critical'].includes(n.type))
  const other    = data.notifs.filter(n => !['reply_received', 'bounce', 'quota_warning', 'ai_budget_warning', 'ai_budget_critical'].includes(n.type))

  const link = (href: string, text: string) =>
    `<a href="${data.appUrl}${href}" style="color:#3b82f6;text-decoration:none;">${text}</a>`

  const section = (emoji: string, title: string, items: string[]) =>
    items.length === 0 ? '' : `
    <div style="margin:20px 0;padding:16px;background:#f8fafc;border-radius:8px;border-left:3px solid #3b82f6;">
      <p style="margin:0 0 10px;font-weight:600;color:#1e293b;">${emoji} ${title}</p>
      <ul style="margin:0;padding:0 0 0 16px;">
        ${items.map(i => `<li style="margin:4px 0;color:#475569;font-size:14px;">${i}</li>`).join('')}
      </ul>
    </div>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
    <div style="background:#1e293b;padding:24px;text-align:center;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">Summits CRM</p>
      <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Daily Summary — ${data.today}</p>
    </div>
    <div style="padding:24px;">
      ${section('🎯', `Follow-ups Due Today (${data.followUps.length})`,
        data.followUps.map(f => `${f.name}${f.notes ? ` — <em>${f.notes}</em>` : ''} ${link(`/leads/${f.id}`, 'View →')}`)
      )}
      ${section('📬', `Replies Received (${replies.length})`,
        replies.map(r => `${r.title}${r.link ? ` ${link(r.link, 'View →')}` : ''}`)
      )}
      ${alerts.length > 0 ? section('⚠️', 'Alerts', alerts.map(a => a.title)) : ''}
      ${bounces.length > 0 ? section('🔴', `Bounces (${bounces.length})`, bounces.map(b => b.title)) : ''}
      ${other.length > 0 ? section('🔔', 'Other Notifications', other.map(n => n.title)) : ''}

      <div style="margin:20px 0;padding:16px;background:#f0fdf4;border-radius:8px;border-left:3px solid #22c55e;">
        <p style="margin:0 0 8px;font-weight:600;color:#1e293b;">📊 Yesterday's Activity</p>
        <p style="margin:0;color:#475569;font-size:14px;">
          Emails sent: <strong>${data.stats.emailsSent}</strong> &nbsp;·&nbsp;
          Replies: <strong>${data.stats.repliesReceived}</strong>
        </p>
      </div>

      <div style="text-align:center;margin-top:24px;">
        <a href="${data.appUrl}/dashboard"
           style="display:inline-block;padding:12px 28px;background:#3b82f6;color:#fff;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">
          View Full Dashboard →
        </a>
      </div>
    </div>
    <div style="padding:16px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">
        Manage your notification preferences in
        <a href="${data.appUrl}/settings/notifications" style="color:#3b82f6;">Settings</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

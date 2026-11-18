import { redirect } from 'next/navigation'
import { getActor } from '@/lib/auth/actor'
import { createAdminClient } from '@/lib/supabase/server'
import { getUsersById } from '@/lib/users'
import { WebsiteLeadsClient, type WebsiteLeadRow } from './website-leads-client'

export const metadata = { title: 'Website Leads — Summit CRM' }

function serverNow() { return Date.now() }

/**
 * Admin-only list of leads that came in through the summitmergers.com forms
 * (and the ads that point at them). A lead counts as a website lead when
 * `custom_fields.website_submissions` exists — written by
 * POST /api/public/website-lead.
 */
export default async function WebsiteLeadsPage() {
  const actor = await getActor()
  if (!actor) redirect('/login')
  if (!['admin', 'super_admin'].includes(actor.role)) redirect('/dashboard')

  const admin = createAdminClient()

  const [{ data: leads }, { data: members }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('leads')
      .select('id, first_name, last_name, email, phone, company, status, assigned_to, created_at, custom_fields')
      .eq('workspace_id', actor.workspaceId)
      .not('custom_fields->website_submissions', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('workspace_members')
      .select('user_id, is_active')
      .eq('workspace_id', actor.workspaceId),
  ])

  const memberRows = (members ?? []) as Array<{ user_id: string; is_active: boolean }>
  const usersById = await getUsersById(admin, actor.workspaceId, memberRows.map((m) => m.user_id))
  const teamMembers = memberRows
    .filter((m) => m.is_active)
    .map((m) => ({ id: m.user_id, name: usersById.get(m.user_id) ?? m.user_id }))

  const rows: WebsiteLeadRow[] = ((leads ?? []) as Array<Record<string, unknown>>).map((l) => {
    const cf = (l.custom_fields ?? {}) as Record<string, unknown>
    const subs = Array.isArray(cf.website_submissions) ? (cf.website_submissions as Array<Record<string, string>>) : []
    const last = subs[subs.length - 1] ?? {}
    const first = subs[0] ?? {}
    const campaign = new URLSearchParams(String(last.campaign || first.campaign || ''))
    return {
      id: String(l.id),
      name: [l.first_name, l.last_name].filter(Boolean).join(' ') || String(l.email ?? 'Unknown'),
      email: (l.email as string) ?? '',
      phone: (l.phone as string) ?? '',
      company: (l.company as string) ?? '',
      status: String(l.status ?? 'new'),
      assignedTo: (l.assigned_to as string) ?? null,
      createdAt: String(l.created_at),
      lastSubmittedAt: String(last.submitted_at || l.created_at),
      submissions: subs.length,
      form: String(last.form || first.form || 'website'),
      utmSource: campaign.get('utm_source') ?? '',
      utmCampaign: campaign.get('utm_campaign') ?? '',
      utmMedium: campaign.get('utm_medium') ?? '',
      revenue: String(last.annual_revenue || last.revenue || first.revenue || ''),
      years: String(last.years_in_business || first.years_in_business || ''),
      employees: String(last.employees || first.employees || ''),
      timeline: String(last.timeline || first.timeline || ''),
      serviceArea: String(last.service_area || first.service_area || ''),
      reason: String(last.selling_reason || first.selling_reason || ''),
    }
  })

  return (
    <WebsiteLeadsClient
      rows={rows}
      teamMembers={teamMembers}
      currentUserId={actor.userId}
      nowMs={serverNow()}
    />
  )
}

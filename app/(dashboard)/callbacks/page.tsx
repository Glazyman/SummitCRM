import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PhoneCall } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Callback Queue' }

function leadName(first: string | null, last: string | null, email: string) {
  return [first, last].filter(Boolean).join(' ') || email
}

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}

export default async function CallbackQueuePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

  if (!member) redirect('/login')

  const isAdmin = ['admin', 'super_admin'].includes(member.role)
  const query = supabase
    .from('call_logs')
    .select('lead_id, called_at, leads!inner(id, first_name, last_name, email, company, assigned_to)')
    .eq('workspace_id', member.workspace_id)
    .eq('outcome', 'callback_requested')
    .order('called_at', { ascending: false })
    .limit(300)

  const { data } = isAdmin
    ? await query
    : await query.eq('leads.assigned_to', user.id)

  const seen = new Set<string>()
  const rows: Array<{ lead_id: string; called_at: string; leads: { id: string; first_name: string | null; last_name: string | null; email: string; company: string | null } | null }> = []
  for (const item of ((data ?? []) as Array<{ lead_id: string; called_at: string; leads: { id: string; first_name: string | null; last_name: string | null; email: string; company: string | null }[] }>)) {
    const lead = item.leads?.[0] ?? null
    if (!lead || seen.has(item.lead_id)) continue
    seen.add(item.lead_id)
    rows.push({ lead_id: item.lead_id, called_at: item.called_at, leads: lead })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Callback Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">Leads with callback requested, sorted by newest request.</p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Lead</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Company</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Callback Requested</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-sm text-muted-foreground" colSpan={4}>No callbacks queued.</td>
              </tr>
            ) : rows.map((r) => (
              <tr key={r.lead_id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{leadName(r.leads?.first_name ?? null, r.leads?.last_name ?? null, r.leads?.email ?? 'Lead')}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.leads?.company ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(r.called_at).toLocaleString()} · {relative(r.called_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/leads/${r.lead_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <PhoneCall className="h-3.5 w-3.5" /> Open Lead
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

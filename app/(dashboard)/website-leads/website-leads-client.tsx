'use client'

import * as React from 'react'
import { Globe, Megaphone, Search, UserX, CalendarDays } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SelectMenu } from '@/components/ui/select-menu'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { LeadFullPanel } from '@/components/leads/lead-full-panel'
import type { TeamMember } from '@/components/leads/detail/types'

export interface WebsiteLeadRow {
  id: string
  name: string
  email: string
  phone: string
  company: string
  status: string
  assignedTo: string | null
  createdAt: string
  lastSubmittedAt: string
  submissions: number
  form: string
  utmSource: string
  utmCampaign: string
  utmMedium: string
  revenue: string
  years: string
  employees: string
  timeline: string
  serviceArea: string
  reason: string
}

const FORM_LABELS: Record<string, string> = {
  'hvac funnel': 'HVAC funnel',
  'sell-and-retire': 'Sell & retire',
  homepage: 'Homepage',
  'deals page': 'Deals page',
}

const dash = (v: string) => v.replace(/\s+-\s+/g, '–').replace(/(\d)-(\d)/g, '$1–$2')
const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function sourceLabel(r: WebsiteLeadRow) {
  if (!r.utmSource) return { label: 'Organic', ad: false }
  return { label: titleCase(r.utmSource), ad: true }
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />{label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

export function WebsiteLeadsClient({
  rows: initialRows,
  teamMembers,
  currentUserId,
  nowMs,
}: {
  rows: WebsiteLeadRow[]
  teamMembers: TeamMember[]
  currentUserId: string
  /** server render time — the client must not read the clock during render */
  nowMs: number
}) {
  const [rows, setRows] = React.useState(initialRows)
  const [q, setQ] = React.useState('')
  const [source, setSource] = React.useState('')
  const [form, setForm] = React.useState('')
  const [selected, setSelected] = React.useState<string | null>(null)

  const memberName = React.useMemo(() => new Map(teamMembers.map((m) => [m.id, m.name])), [teamMembers])

  const forms = React.useMemo(
    () => [...new Set(rows.map((r) => r.form))].map((f) => ({ value: f, label: FORM_LABELS[f] ?? titleCase(f) })),
    [rows],
  )

  const filtered = rows.filter((r) => {
    if (source === 'ads' && !r.utmSource) return false
    if (source === 'organic' && r.utmSource) return false
    if (form && r.form !== form) return false
    if (q) {
      const hay = `${r.name} ${r.email} ${r.phone} ${r.company} ${r.serviceArea} ${r.utmCampaign} ${r.reason}`.toLowerCase()
      if (!q.toLowerCase().split(/\s+/).every((t) => hay.includes(t))) return false
    }
    return true
  })

  const weekAgo = nowMs - 7 * 24 * 3600 * 1000
  const stats = {
    total: rows.length,
    week: rows.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length,
    unassigned: rows.filter((r) => !r.assignedTo).length,
    ads: rows.filter((r) => r.utmSource).length,
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-[-0.02em]">Website Leads</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Owners who filled out a form on summitmergers.com, including visitors from ads. Admin only.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Globe} label="Total website leads" value={stats.total} />
        <Stat icon={CalendarDays} label="Last 7 days" value={stats.week} />
        <Stat icon={UserX} label="Unassigned" value={stats.unassigned} />
        <Stat icon={Megaphone} label="From ads / campaigns" value={stats.ads} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, area, campaign…" className="pl-9" />
        </div>
        <SelectMenu
          value={source}
          onChange={setSource}
          nullable
          nullLabel="All sources"
          placeholder="All sources"
          options={[{ value: 'ads', label: 'Ads / campaigns' }, { value: 'organic', label: 'Organic' }]}
          className="sm:w-48"
        />
        <SelectMenu
          value={form}
          onChange={setForm}
          nullable
          nullLabel="All forms"
          placeholder="All forms"
          options={forms}
          className="sm:w-48"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? 'No website leads yet. They appear here automatically when someone submits a form on summitmergers.com.'
            : 'No leads match these filters.'}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Received</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead className="hidden lg:table-cell">Years</TableHead>
              <TableHead className="hidden lg:table-cell">Employees</TableHead>
              <TableHead className="hidden xl:table-cell">Timeline</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Assigned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const src = sourceLabel(r)
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r.id)}>
                  <TableCell className="whitespace-nowrap text-[13px] text-muted-foreground">
                    {fmtDate(r.createdAt)}
                    {r.submissions > 1 && <div className="text-[11px]">{r.submissions} submissions</div>}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    {(r.company || r.serviceArea) && (
                      <div className="text-[12px] text-muted-foreground">{r.company || r.serviceArea}</div>
                    )}
                    {r.reason && <div className="mt-0.5 text-[12px] font-medium text-red-700">{r.reason}</div>}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    <div>{r.email}</div>
                    {r.phone && <div className="text-muted-foreground">{r.phone}</div>}
                  </TableCell>
                  <TableCell className="text-[13px]">
                    <Badge variant={src.ad ? 'info' : 'outline'}>{src.label}</Badge>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {FORM_LABELS[r.form] ?? titleCase(r.form)}{r.utmCampaign && ` · ${r.utmCampaign}`}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[13px]">{dash(r.revenue) || '—'}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-[13px] lg:table-cell">{dash(r.years) || '—'}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-[13px] lg:table-cell">{dash(r.employees) || '—'}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-[13px] xl:table-cell">{dash(r.timeline) || '—'}</TableCell>
                  <TableCell><Badge variant="secondary">{titleCase(r.status)}</Badge></TableCell>
                  <TableCell className="hidden text-[13px] md:table-cell">
                    {r.assignedTo ? memberName.get(r.assignedTo) ?? '—' : <span className="text-amber-600">Unassigned</span>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {selected && (
        <LeadFullPanel
          leadId={selected}
          teamMembers={teamMembers}
          isAdmin
          currentUserId={currentUserId}
          canEditBatch
          onClose={() => setSelected(null)}
          onLeadChange={(patch) => {
            setRows((prev) => prev.map((r) => r.id !== selected ? r : {
              ...r,
              ...(patch.status ? { status: String(patch.status) } : {}),
              ...('assigned_to' in patch ? { assignedTo: (patch.assigned_to as string | null) ?? null } : {}),
            }))
          }}
        />
      )}
    </div>
  )
}

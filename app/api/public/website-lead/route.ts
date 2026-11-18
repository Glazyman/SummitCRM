import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/public/website-lead
 *
 * PUBLIC (unauthenticated) intake endpoint for the summitmergers.com seller
 * forms (/sell-hvac-business.html, /sell-and-retire.html, homepage #contact).
 * The site posts here in parallel with Formspree; Formspree stays the source
 * of the email notification, so a failure here never loses a lead.
 *
 * - Creates a lead in the Summit Mergers workspace (source = 'api' — the DB
 *   check constraint has no 'website' value; origin is tracked via the batch,
 *   status = 'new', unassigned) in the "Website Leads" batch.
 * - Maps form answers into custom_fields._questionnaire.answers using the
 *   SAME ids as components/leads/detail/questionnaire.tsx (employees, union,
 *   years_in_business, service_area, avg_job_size, revenue, ebitda,
 *   main_service, service_breakdown, owner_plans) so they show in the Intake tab.
 * - Repeat email in the workspace → no duplicate lead: appends the submission
 *   to custom_fields.website_submissions and only fills EMPTY intake answers.
 * - Notifies active admins in-app.
 */

const WORKSPACE_ID = process.env.WEBSITE_LEADS_WORKSPACE_ID || '0f69bfc5-fe68-4c0f-98d2-b17e3a08cbb6'
const BATCH_NAME = 'Website Leads'
const RANGE_TAG = '(range from website form)'
const ALLOWED_ORIGINS = new Set([
  'https://summitmergers.com',
  'https://www.summitmergers.com',
])

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (origin && ALLOWED_ORIGINS.has(origin)) h['Access-Control-Allow-Origin'] = origin
  return h
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

const s = (max: number) => z.string().trim().max(max).optional().default('')

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().trim().max(40).refine((p) => p.replace(/\D/g, '').length >= 10, 'phone'),
  company: s(200),
  form: s(60),               // which page sent it, e.g. "hvac funnel"
  page: s(300),
  campaign: s(500),          // utm string
  industry: s(80),
  revenue: s(40),            // range picked on the form
  customer_type: s(80),
  work_type: s(80),
  years_in_business: s(40),
  employees: s(40),
  union: s(10),
  service_area: s(300),
  avg_job_size: s(40),
  annual_revenue: s(40),     // optional exact figure
  ebitda: s(40),
  owner_plans: s(120),
  timeline: s(80),
  priorities: s(400),
  message: s(4000),
  _gotcha: s(200),           // honeypot — must be empty
})

/** "26-50" → "26–50", "10-20 years" → "10–20" (matches the CRM's free-text style). */
const dash = (v: string) => v.replace(/\s+-\s+/g, '–').replace(/(\d)-(\d)/g, '$1–$2')

function intakeAnswers(b: z.infer<typeof Body>): Record<string, string> {
  const a: Record<string, string> = {}
  if (b.employees) a.employees = dash(b.employees)
  if (b.union) a.union = b.union.toLowerCase() === 'yes' ? 'yes' : b.union.toLowerCase() === 'no' ? 'no' : b.union
  if (b.years_in_business) a.years_in_business = dash(b.years_in_business.replace(/\s*years?$/i, ''))
  if (b.service_area) a.service_area = b.service_area
  if (b.avg_job_size) a.avg_job_size = b.avg_job_size
  if (b.annual_revenue) a.revenue = b.annual_revenue
  else if (b.revenue) a.revenue = `${dash(b.revenue)} ${RANGE_TAG}`
  if (b.ebitda) a.ebitda = b.ebitda
  if (b.work_type) a.main_service = b.work_type
  const breakdown = [b.industry && `Industry: ${b.industry}`, b.customer_type && `Customers: ${b.customer_type}`].filter(Boolean)
  if (breakdown.length) a.service_breakdown = breakdown.join('\n')
  const plans = [
    b.owner_plans && `After the sale: ${dash(b.owner_plans)}`,
    b.timeline && `Timeline: ${dash(b.timeline)}`,
    b.priorities && `Priorities: ${b.priorities}`,
    b.message && `Owner's note (website): ${b.message}`,
  ].filter(Boolean)
  if (plans.length) a.owner_plans = plans.join('\n')
  return a
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  }

  let parsed: z.infer<typeof Body>
  try {
    const raw = await req.json()
    const r = Body.safeParse(raw)
    if (!r.success) return NextResponse.json({ error: 'Invalid submission' }, { status: 400, headers })
    parsed = r.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
  }

  // Honeypot filled → pretend success, store nothing.
  if (parsed._gotcha) return NextResponse.json({ ok: true }, { headers })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const now = new Date().toISOString()
    const [first, ...rest] = parsed.name.split(/\s+/)
    const answers = intakeAnswers(parsed)
    const clean: Partial<typeof parsed> = { ...parsed }
    delete clean._gotcha
    const submission = { ...clean, submitted_at: now }

    // Active admins: batch creator + notification recipients
    const { data: admins } = await admin
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', WORKSPACE_ID)
      .eq('is_active', true)
      .in('role', ['super_admin', 'admin'])
    const adminIds: string[] = (admins ?? []).map((m: { user_id: string }) => m.user_id)

    // Existing lead with this email? → merge, never duplicate or overwrite
    const { data: existing } = await admin
      .from('leads')
      .select('id, custom_fields, phone, first_name, last_name, company')
      .eq('workspace_id', WORKSPACE_ID)
      .ilike('email', parsed.email)
      .limit(1)
      .maybeSingle()

    let leadId: string
    let isNew = false

    if (existing) {
      leadId = existing.id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cf = (existing.custom_fields as Record<string, any>) ?? {}
      const q = cf._questionnaire ?? {}
      const prevAnswers: Record<string, string> = q.answers ?? {}
      const merged = { ...prevAnswers }
      // Fill only empty answers — except an exact revenue may replace the website's range placeholder
      for (const [k, v] of Object.entries(answers)) {
        const cur = String(merged[k] ?? '').trim()
        const upgradeRange = k === 'revenue' && cur.endsWith(RANGE_TAG) && !v.endsWith(RANGE_TAG)
        if (!cur || upgradeRange) merged[k] = v
      }
      const subs = Array.isArray(cf.website_submissions) ? cf.website_submissions : []
      await admin
        .from('leads')
        .update({
          phone: existing.phone || parsed.phone,
          first_name: existing.first_name || first || null,
          last_name: existing.last_name || rest.join(' ') || null,
          company: existing.company || parsed.company || null,
          custom_fields: {
            ...cf,
            _questionnaire: { ...q, answers: merged, updated_at: now },
            website_submissions: [...subs, submission].slice(-20),
          },
          updated_at: now,
        })
        .eq('id', leadId)
      await admin.from('activity_logs').insert({
        workspace_id: WORKSPACE_ID, lead_id: leadId, user_id: null,
        // prod activity_type enum has no 'lead_updated' (PROJECT_BRAIN listed it wrongly) → lead_imported + flag
        type: 'lead_imported', metadata: { source: 'website', form: parsed.form || null, resubmission: true },
      })
    } else {
      // Find or create the "Website Leads" batch
      let batchId: string | null = null
      const { data: batch } = await admin
        .from('lead_batches').select('id')
        .eq('workspace_id', WORKSPACE_ID).eq('name', BATCH_NAME)
        .limit(1).maybeSingle()
      if (batch) batchId = batch.id
      else if (adminIds[0]) {
        const { data: nb } = await admin
          .from('lead_batches')
          .insert({ workspace_id: WORKSPACE_ID, name: BATCH_NAME, description: 'Seller inquiries from summitmergers.com forms', created_by: adminIds[0] })
          .select('id').single()
        batchId = nb?.id ?? null
      }

      const { data: lead, error } = await admin
        .from('leads')
        .insert({
          workspace_id: WORKSPACE_ID,
          first_name: first || null,
          last_name: rest.join(' ') || null,
          email: parsed.email,
          phone: parsed.phone,
          company: parsed.company || null,
          batch_id: batchId,
          assigned_to: null,
          status: 'new',
          source: 'api', // leads_source_check allows manual|csv_import|api|invite; website origin = batch + custom_fields.website_submissions
          custom_fields: {
            _questionnaire: { answers, updated_at: now },
            website_submissions: [submission],
          },
        })
        .select('id').single()
      if (error || !lead) {
        console.error('[website-lead insert]', error)
        return NextResponse.json({ error: 'Could not save' }, { status: 500, headers })
      }
      leadId = lead.id
      isNew = true
      await admin.from('activity_logs').insert({
        workspace_id: WORKSPACE_ID, lead_id: leadId, user_id: null,
        type: 'lead_created', metadata: { source: 'website', form: parsed.form || null },
      })
    }

    // In-app heads-up for admins (enum only has mention | follow_up_due | lead_assigned)
    if (adminIds.length) {
      const summary = [parsed.revenue, parsed.years_in_business, parsed.employees && `${parsed.employees} employees`, parsed.timeline]
        .filter(Boolean).map((v) => dash(String(v))).join(' · ')
      await admin.from('notifications').insert(
        adminIds.map((uid) => ({
          workspace_id: WORKSPACE_ID,
          user_id: uid,
          type: 'lead_assigned',
          title: `${isNew ? 'New' : 'Returning'} website lead: ${parsed.name}`,
          body: summary || parsed.form || 'Website form submission',
          link: `/leads/${leadId}`,
          lead_id: leadId,
          is_read: false,
        })),
      )
    }

    return NextResponse.json({ ok: true, new: isNew }, { headers })
  } catch (err) {
    console.error('[website-lead]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers })
  }
}

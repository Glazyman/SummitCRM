/**
 * Builds a Summit-Deals–style plain-text snapshot from the lead profile +
 * questionnaire data, then opens it as a Gmail compose draft in a new tab.
 *
 * Fields are read by the question IDs defined in `components/leads/detail/
 * questionnaire.tsx` (revenue, ebitda, residential_pct, etc.). Custom
 * questions added by users land in an "Additional Notes" section.
 */

export interface SnapshotLead {
  first_name: string | null
  last_name:  string | null
  email:      string
  phone:      string | null
  company:    string | null
  website:    string | null
}

export interface SnapshotQuestionDef {
  id:     string
  label:  string
  type:   'text' | 'textarea' | 'yesno'
  custom?: boolean
}

export interface SnapshotInput {
  lead_id?:  string
  lead:      SnapshotLead
  answers:   Record<string, string>
  questions: SnapshotQuestionDef[]
}

// ── Constants ─────────────────────────────────────────────────────────────
const DIVIDER = '──────────────────────────────────'

// Field IDs that the Questionnaire knows about by default — used to decide
// which question goes into the structured Summit-Deals layout vs the
// catch-all "Additional Notes" block.
const KNOWN_IDS = new Set([
  'employees', 'union', 'years_in_business', 'service_area',
  'residential_pct', 'commercial_pct',
  'install_pct', 'retrofit_pct', 'service_maint_pct',
  'avg_job_size', 'revenue', 'ebitda',
  'service_breakdown', 'main_service', 'largest_project',
  'key_employees', 'owner_plans',
])

// ── Helpers ───────────────────────────────────────────────────────────────
function clean(v: string | undefined | null): string {
  return (v ?? '').trim()
}

function pad(label: string, width: number): string {
  return label.length >= width ? label + ' ' : label + ' '.repeat(width - label.length)
}

function row(label: string, value: string, width = 22): string | null {
  if (!clean(value)) return null
  return `  ${pad(label + ':', width)}${clean(value)}`
}

function section(title: string, rows: Array<string | null>): string | null {
  const filled = rows.filter((r): r is string => Boolean(r))
  if (filled.length === 0) return null
  return [title, ...filled].join('\n')
}

function bulletsFromLines(raw: string): string | null {
  const lines = raw.split('\n').map((l) => l.replace(/^[\s•\-\*]+/, '').trim()).filter(Boolean)
  if (lines.length === 0) return null
  return lines.map((l) => `  - ${l}`).join('\n')
}

function indentBlock(raw: string): string | null {
  const cleaned = clean(raw)
  if (!cleaned) return null
  return cleaned.split('\n').map((l) => `  ${l.trim()}`).filter((l) => l.trim()).join('\n')
}

function textBlock(title: string, raw: string): string | null {
  const body = bulletsFromLines(raw) ?? indentBlock(raw)
  if (!body) return null
  return `${title}\n${body}`
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

// ── Snapshot builder ──────────────────────────────────────────────────────
export function buildSnapshot({ lead, answers, questions }: SnapshotInput): string {
  const get = (id: string) => clean(answers[id])

  // Header --------------------------------------------------------------
  const companyName = clean(lead.company) || '(Company name)'
  const mainService = get('main_service')
  const serviceArea = get('service_area')
  const website     = clean(lead.website)

  const header: string[] = [companyName.toUpperCase()]
  if (mainService) header.push(mainService.split('\n')[0])
  const locWeb = [serviceArea, website ? stripScheme(website) : '']
    .filter(Boolean)
    .join(' | ')
  if (locWeb) header.push(locWeb)

  // Financial overview --------------------------------------------------
  const financial = section('FINANCIAL OVERVIEW', [
    row('Revenue',      get('revenue')),
    row('EBITDA',       get('ebitda')),
    row('Average Job',  get('avg_job_size')),
  ])

  // Operations ----------------------------------------------------------
  const employees = get('employees')
  const union     = get('union').toLowerCase()
  const unionTag  = union === 'yes' ? 'Union' : union === 'no' ? 'Non-Union' : ''
  const employeesLine = employees
    ? unionTag ? `${employees} (${unionTag})` : employees
    : ''

  const residential = get('residential_pct')
  const commercial  = get('commercial_pct')
  const marketFocus = [
    residential ? `${residential} Residential` : '',
    commercial  ? `${commercial} Commercial`   : '',
  ].filter(Boolean).join(' / ')

  const operations = section('OPERATIONS', [
    row('Employees',         employeesLine),
    row('Service Area',      serviceArea),
    row('Years in Business', get('years_in_business')),
    row('Market Focus',      marketFocus),
  ])

  // Service mix ---------------------------------------------------------
  const serviceMix = section('SERVICE MIX', [
    row('Install',                get('install_pct')),
    row('Retrofit',               get('retrofit_pct')),
    row('Service & Maintenance',  get('service_maint_pct')),
  ])

  // Free-text narrative blocks -----------------------------------------
  const serviceBreakdown = textBlock('SERVICE BREAKDOWN', get('service_breakdown'))
  const largestProject   = textBlock('LARGEST PROJECT',   get('largest_project'))

  const keyEmployees     = get('key_employees')
  const ownerPlans       = get('owner_plans')
  const ownershipRows: Array<string | null> = []
  if (keyEmployees) ownershipRows.push(`  Key Employees: ${keyEmployees.replace(/\n+/g, ' / ')}`)
  if (ownerPlans)   ownershipRows.push(`  Owner Plans:   ${ownerPlans.replace(/\n+/g, ' / ')}`)
  const ownership = ownershipRows.length
    ? ['OWNERSHIP & TRANSITION', ...ownershipRows].join('\n')
    : null

  // Custom / additional questions --------------------------------------
  const additional = questions
    .filter((q) => q.custom || !KNOWN_IDS.has(q.id))
    .map((q) => {
      const v = get(q.id)
      if (!v) return null
      return q.type === 'textarea'
        ? `  ${q.label}:\n${indentBlock(v) ?? ''}`
        : `  ${q.label}: ${v}`
    })
    .filter((r): r is string => Boolean(r))
  const additionalBlock = additional.length
    ? ['ADDITIONAL NOTES', ...additional].join('\n')
    : null

  // Contact -------------------------------------------------------------
  const contactLines = [
    [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim(),
    clean(lead.phone),
    clean(lead.email),
  ].filter(Boolean)
  const contact = contactLines.length
    ? `CONTACT\n${contactLines.map((l) => `  ${l}`).join('\n')}`
    : null

  // Assemble ------------------------------------------------------------
  const middle = [financial, operations, serviceMix]
    .filter((s): s is string => Boolean(s))
    .join('\n\n')

  const narrative = [serviceBreakdown, largestProject, ownership, additionalBlock]
    .filter((s): s is string => Boolean(s))
    .join('\n\n')

  const parts: string[] = []
  parts.push(header.join('\n'))
  parts.push(DIVIDER)
  if (middle)    { parts.push(middle);    parts.push(DIVIDER) }
  if (narrative) { parts.push(narrative); parts.push(DIVIDER) }
  if (contact) parts.push(contact)

  return parts.join('\n\n') + '\n'
}

// ── Visual bold for plain-text email ──────────────────────────────────────
// Gmail's compose URL accepts plain text only, so we use the Unicode
// Mathematical Sans-Serif Bold block (U+1D5D4…). Modern mail clients
// render these as bold by default.
function toUnicodeBold(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x41 && code <= 0x5A)      out += String.fromCodePoint(0x1D5D4 + code - 0x41)  // A-Z
    else if (code >= 0x61 && code <= 0x7A) out += String.fromCodePoint(0x1D5EE + code - 0x61)  // a-z
    else if (code >= 0x30 && code <= 0x39) out += String.fromCodePoint(0x1D7EC + code - 0x30)  // 0-9
    else out += ch
  }
  return out
}

/**
 * Bold the section headers in a snapshot email body. Targets:
 *   - the literal line "Company Snapshot"
 *   - any non-indented line that is a label ending in `:` (Revenue:, Team:, etc.)
 * Indented lines (bullets/data) are left alone.
 */
export function styleSnapshotBody(body: string): string {
  return body
    .split('\n')
    .map((line) => {
      if (/^\s/.test(line)) return line
      if (line.trim() === 'Company Snapshot')        return toUnicodeBold(line)
      if (/^[A-Z][A-Za-z0-9 &/'-]*:\s*$/.test(line)) return toUnicodeBold(line)
      return line
    })
    .join('\n')
}

// ── Gmail compose URL ─────────────────────────────────────────────────────
/**
 * Build a Gmail compose URL. Uses encodeURIComponent (%20 for spaces) for
 * maximum Gmail compatibility — URLSearchParams encodes spaces as `+` which
 * Gmail's body parser sometimes treats as a literal plus.
 */
export function buildGmailComposeUrl(opts: {
  subject: string
  body:    string
  to?:     string
}): string {
  const parts: string[] = ['view=cm', 'fs=1']
  if (opts.to)      parts.push(`to=${encodeURIComponent(opts.to)}`)
  if (opts.subject) parts.push(`su=${encodeURIComponent(opts.subject)}`)
  if (opts.body)    parts.push(`body=${encodeURIComponent(opts.body)}`)
  return `https://mail.google.com/mail/?${parts.join('&')}`
}

/**
 * Generate the Gmail compose URL for this lead's snapshot.
 *
 * Tries the AI-polished version via /api/ai/snapshot-email first, falls back
 * to the deterministic template if AI is unavailable. Always resolves with a
 * usable URL — the caller is responsible for opening it from a fresh user
 * gesture (e.g. an <a target="_blank"> click) to avoid popup blockers.
 */
export async function prepareSnapshotEmail(input: SnapshotInput): Promise<string> {
  let subject: string
  let body:    string
  let source:  'ai' | 'template' = 'template'

  try {
    const res = await fetch('/api/ai/snapshot-email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`AI snapshot returned ${res.status}`)
    const data = await res.json() as { subject?: string; body?: string }
    if (!data.subject || !data.body) throw new Error('AI snapshot missing fields')
    subject = data.subject
    body    = data.body
    source  = 'ai'
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[Intake Snapshot] AI unavailable, using template fallback:', err)
    }
    body = buildSnapshot(input)
    const company = clean(input.lead.company)
    subject = company ? `${company} – Snapshot` : 'Deal Snapshot'
  }

  const styledBody = styleSnapshotBody(body)
  const url        = buildGmailComposeUrl({ subject, body: styledBody })
  if (typeof console !== 'undefined') {
    console.log(`[Intake Snapshot] source: ${source}, url length: ${url.length}`)
    console.log('[Intake Snapshot] body:\n' + styledBody)
  }
  return url
}

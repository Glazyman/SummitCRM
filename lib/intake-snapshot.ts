/**
 * Builds a Summit-Deals–style plain-text snapshot from the lead profile +
 * questionnaire data, then opens it as an Outlook compose draft in a new tab.
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

// Field IDs the Questionnaire knows about by default — used to decide
// which question goes into the structured layout vs the "Additional Notes"
// block at the end.
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

/** A "Section: \n  bullet\n  bullet" block, omitted entirely if no bullets. */
function snapshotSection(label: string, bullets: Array<string | null | undefined>): string | null {
  const filled = bullets
    .map((b) => clean(b ?? ''))
    .filter(Boolean)
  if (filled.length === 0) return null
  return `${label}:\n${filled.map((b) => `  ${b}`).join('\n')}`
}

/** Split a free-form textarea answer into bullets. Strips bullet glyphs. */
function answerBullets(raw: string): string[] {
  return clean(raw)
    .split('\n')
    .map((l) => l.replace(/^[\s•\-\*]+/, '').trim())
    .filter(Boolean)
}

// ── Snapshot builder ──────────────────────────────────────────────────────
/**
 * Deterministic fallback in the SAME visual format the AI prompt asks for.
 * The shape mirrors lib/ai/prompts.ts STYLE_EXAMPLE — a deal-teaser email
 * with "Hi,", a short pitch line, a 2-3 sentence narrative, then a
 * "Company Snapshot" block with Title Case section labels and indented
 * bullets (two spaces, no dash glyph).
 */
export function buildSnapshot({ lead, answers, questions }: SnapshotInput): string {
  const get = (id: string) => clean(answers[id])

  const company     = clean(lead.company)
  const mainService = get('main_service').split('\n')[0]
  const serviceArea = get('service_area')
  const years       = get('years_in_business')
  const residential = get('residential_pct')
  const commercial  = get('commercial_pct')

  // ── Opener + narrative ──────────────────────────────────────────────
  // Summit Mergers is an HVAC-focused advisory, so the fallback assumes
  // HVAC. The admin can adjust before sending if the lead is a different
  // trade. (The AI version reads main_service and adjusts on its own.)
  const pitch = 'We have an HVAC opportunity that may be a fit for your platform.'

  const narrativeBits: string[] = []
  const descriptor = company ? `${company} is` : 'Business is'
  const geoPart    = serviceArea ? ` based in ${serviceArea}` : ''
  let leadSentence = `${descriptor} a well-established HVAC contractor${geoPart}`
  if (years) leadSentence += ` with ${years} of operating history`
  leadSentence += '.'
  narrativeBits.push(leadSentence)
  if (mainService) narrativeBits.push(`Primary offering: ${mainService}.`)

  if (residential || commercial) {
    const mixLabel = residential && commercial
      ? `${residential} residential and ${commercial} commercial`
      : residential
        ? `predominantly residential (~${residential})`
        : `predominantly commercial (~${commercial})`
    narrativeBits.push(`Revenue mix is ${mixLabel}.`)
  }
  const narrative = narrativeBits.join(' ')

  // ── Snapshot sections (only render if data is present) ──────────────
  const revenue = get('revenue')
  const ebitda  = get('ebitda')
  const employees = get('employees')
  const union     = get('union').toLowerCase()
  const teamBits: string[] = []
  if (employees) teamBits.push(`${employees} employees`)
  if (union === 'yes')      teamBits.push('Union')
  else if (union === 'no')  teamBits.push('Non-union')

  const marketBits: string[] = []
  if (residential && commercial) {
    marketBits.push(`${residential} residential / ${commercial} commercial`)
  } else if (residential) {
    marketBits.push(`Predominantly residential (~${residential})`)
  } else if (commercial) {
    marketBits.push(`Predominantly commercial (~${commercial})`)
  }

  const serviceMixBits: string[] = []
  const install = get('install_pct')
  const retro   = get('retrofit_pct')
  const maint   = get('service_maint_pct')
  if (install) serviceMixBits.push(`${install} installation`)
  if (retro)   serviceMixBits.push(`${retro} retrofit`)
  if (maint)   serviceMixBits.push(`${maint} service & maintenance`)
  // Free-form service breakdown — supplemental, one bullet per line.
  for (const b of answerBullets(get('service_breakdown'))) serviceMixBits.push(b)

  const jobProfileBits: string[] = []
  if (get('avg_job_size')) jobProfileBits.push(`Average job size: ${get('avg_job_size')}`)

  const projectBullets = answerBullets(get('largest_project'))

  const ownershipBits: string[] = []
  for (const b of answerBullets(get('key_employees'))) ownershipBits.push(b)
  for (const b of answerBullets(get('owner_plans')))   ownershipBits.push(b)

  // Custom/extra questions land at the end as Additional Notes.
  const additional = questions
    .filter((q) => q.custom || !KNOWN_IDS.has(q.id))
    .map((q) => {
      const v = get(q.id)
      if (!v) return null
      return q.type === 'textarea'
        ? `${q.label}: ${v.replace(/\n+/g, ' / ')}`
        : `${q.label}: ${v}`
    })
    .filter((r): r is string => Boolean(r))

  const sections: Array<string | null> = [
    snapshotSection('Revenue',          [revenue]),
    snapshotSection('EBITDA',           [ebitda]),
    snapshotSection('Team',             teamBits),
    snapshotSection('Market Mix',       marketBits),
    snapshotSection('Service Mix',      serviceMixBits),
    snapshotSection('Job Profile',      jobProfileBits),
    snapshotSection('Project History',  projectBullets),
    snapshotSection('Geography',        [serviceArea]),
    snapshotSection('Years in Operation', [years]),
    snapshotSection('Ownership',        ownershipBits),
    snapshotSection('Additional Notes', additional),
  ]
  const snapshotBlock = sections.filter((s): s is string => Boolean(s)).join('\n\n')

  // ── Assemble ────────────────────────────────────────────────────────
  const parts: string[] = ['Hi,', '', pitch, '', narrative, '', 'Company Snapshot']
  if (snapshotBlock) parts.push('', snapshotBlock)
  parts.push('', 'Please let me know if this is of interest and I would be happy to coordinate a direct conversation with the owners.')

  return parts.join('\n')
}

// ── Visual bold for plain-text email ──────────────────────────────────────
// Outlook's compose deeplink accepts plain text only (no HTML), so we
// use the Unicode Mathematical Sans-Serif Bold block (U+1D5D4…). Modern
// mail clients (including Outlook) render these as bold by default.
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

// ── Outlook compose URL ───────────────────────────────────────────────────
/**
 * Build an Outlook web compose URL via the Microsoft 365 deeplink.
 *
 * Uses encodeURIComponent (%20 for spaces) rather than URLSearchParams —
 * URLSearchParams encodes spaces as `+`, which the deeplink endpoint
 * sometimes treats as a literal plus inside the body.
 *
 * outlook.office.com works for M365 / business accounts. Personal
 * outlook.com accounts get redirected automatically by Microsoft.
 */
export function buildOutlookComposeUrl(opts: {
  subject: string
  body:    string
  to?:     string
}): string {
  const parts: string[] = ['path=/mail/action/compose']
  if (opts.to)      parts.push(`to=${encodeURIComponent(opts.to)}`)
  if (opts.subject) parts.push(`subject=${encodeURIComponent(opts.subject)}`)
  if (opts.body)    parts.push(`body=${encodeURIComponent(opts.body)}`)
  return `https://outlook.office.com/mail/deeplink/compose?${parts.join('&')}`
}

/**
 * Generate the Outlook compose URL for this lead's snapshot.
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
  const url        = buildOutlookComposeUrl({ subject, body: styledBody })
  if (typeof console !== 'undefined') {
    console.log(`[Intake Snapshot] source: ${source}, url length: ${url.length}`)
    console.log('[Intake Snapshot] body:\n' + styledBody)
  }
  return url
}

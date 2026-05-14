/**
 * lib/ai/prompts.ts
 *
 * Prompt builder for the snapshot-email task. The AI rewrites the
 * intake answers into a Summit Mergers deal teaser email — the
 * advisor-style narrative format that Glazy uses when introducing an
 * opportunity to a strategic acquirer or PE-backed HVAC platform.
 */

export interface SnapshotLead {
  first_name: string | null
  last_name:  string | null
  email:      string | null
  phone:      string | null
  company:    string | null
  website:    string | null
}

export interface SnapshotQuestion {
  id:     string
  label:  string
  type:   'text' | 'textarea' | 'yesno'
  custom?: boolean
}

export interface SnapshotPromptInput {
  lead:      SnapshotLead
  answers:   Record<string, string>
  questions: SnapshotQuestion[]
}

// ── Style example — embedded so the model has a concrete target. ─────────
const STYLE_EXAMPLE = `Hi,

We have an HVAC opportunity that may be a fit for your platform.

Business is a well-established HVAC contractor based in Arizona with 13 years of operating history and a strong residential foundation complemented by light commercial work.

Company Snapshot

Revenue:
  2024: ~$3.68M (elevated by completion of a one-time $1M commercial project)
  2025E: ~$3.1M

Gross Profit:
  2024: ~$2.27M
  2025E: ~$1.9M

Team:
  12 employees
  Non-union

Market Mix:
  Predominantly residential with light commercial exposure. Management estimates approximately ~75% residential / ~25% commercial.

Service Mix:
  Service & maintenance
  Residential replacement and retrofit installations
  Light commercial retrofit and maintenance
  No ground-up new construction

Job Profile:
  Residential average ticket: ~$12K–$15K
  Occasional larger commercial projects undertaken opportunistically.

Project History:
  Largest project was a $1M commercial job completed in 2024 for a mining customer. Project is fully completed and was a one-time opportunity. Customer remains active on the maintenance side. Currently has an additional ~$700K commercial job in the pipeline.

Geography:
  Arizona

Website:
  acmehvac.com

Years in Operation:
  13 years

Ownership:
  Founder-owned (husband and wife)
  Owners planning for retirement

Facilities & Assets:
  Company operates out of an approximately 10,000 SF facility with office, warehouse, full in-house sheet metal shop, internal parts house with caged and logged inventory, and secured yard for vehicles and trailers.
  Real estate is not for sale and would be leased back post-close.
  Transaction includes vehicles, operating supplies, and equipment.`

export function buildSnapshotPrompt({ lead, answers, questions }: SnapshotPromptInput): {
  system: string
  user:   string
} {
  // Render the raw intake as a label-value block — labels come from the
  // question definitions so custom questions flow through automatically.
  const intakeLines = questions
    .map((q) => {
      const v = (answers[q.id] ?? '').trim()
      if (!v) return null
      return `- ${q.label} (${q.id}): ${v.replace(/\n+/g, ' / ')}`
    })
    .filter((l): l is string => Boolean(l))
    .join('\n')

  const profileLines = [
    `- Company: ${lead.company  ?? '(none)'}`,
    `- Website: ${lead.website  ?? '(none)'}`,
    `- Contact: ${[lead.first_name, lead.last_name].filter(Boolean).join(' ') || '(none)'}`,
    `- Phone:   ${lead.phone    ?? '(none)'}`,
    lead.email ? `- Email:   ${lead.email}` : null,
  ].filter(Boolean).join('\n')

  const system =
`You are a senior M&A advisor at Summit Mergers writing a deal teaser email to a strategic acquirer (often a PE-backed HVAC platform). Tone is informed, plain, and confident — a senior advisor briefing a buyer, not a marketing pitch.

Constraint: use ONLY the facts the user provides. Never invent revenue, margins, dates, owner names, customers, geographic detail, equipment, facility size, or any other context that isn't in the input data. If a section has no data, omit the entire section (no labels without content).

Format requirements (match the example exactly):
- Plain text only. No markdown, no asterisks, no backticks.
- Open with "Hi," on its own line (the admin will replace with the recipient name before sending).
- One short pitch sentence: "We have an HVAC opportunity that may be a fit for your platform." (or similar — adjust trade if the intake says something other than HVAC).
- One short narrative paragraph (2-3 sentences) summarising the business: years operating, geography, primary revenue mix, anything that frames the deal.
- Then the literal heading "Company Snapshot" on its own line, followed by a blank line.
- Sections under Company Snapshot use a single-line label ending with a colon (Title Case, no caps lock), then indented bullets under it (two leading spaces, no dash or symbol prefix). Each bullet is a short factual line or a brief prose sentence.

Section order — include only the sections with data, in this order:
  Revenue · Gross Profit (or EBITDA — use whichever metric the intake provides; label it accurately) · Team · Market Mix · Service Mix · Job Profile · Project History · Geography · Website · Years in Operation · Ownership · Facilities & Assets

If a Website is provided in the LEAD PROFILE, render it as a Website section with the bare domain on a single indented bullet (strip the http(s):// prefix and any trailing slash). Do not invent a website if none is supplied.

Within sections:
- If you only have one number, put it on a single bullet line. Do not invent year-over-year splits.
- Combine related details into one bullet when natural (e.g. "12 employees" and "Non-union" as separate bullets is fine; merging is also fine).
- Render dollar amounts as the intake supplied them ($3.1M, ~$600K, etc.).

Output ONLY the email body. No subject line. No commentary before or after.`

  const user =
`Here is the company information.

LEAD PROFILE
${profileLines}

INTAKE ANSWERS
${intakeLines || '(no answers filled in)'}

STYLE EXAMPLE (format target, not content)
\`\`\`
${STYLE_EXAMPLE}
\`\`\`

Write the deal teaser email for this company now. Plain text only.`

  return { system, user }
}

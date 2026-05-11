/**
 * lib/ai/prompts.ts
 *
 * Prompt builder for the snapshot-email task. The AI rewrites the
 * intake answers into a Summit-Mergers-style company snapshot,
 * synthesising "KEY HIGHLIGHTS" bullets from the data.
 */

export interface SnapshotLead {
  first_name: string | null
  last_name:  string | null
  email:      string
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
const STYLE_EXAMPLE = `A1 HEATING AND COOLING
Residential HVAC – Install & Service
West Virginia / Ohio | www.a1heatingandcooling.com

──────────────────────────────────

FINANCIAL OVERVIEW
  Revenue:          $2.0M
  EBITDA:           ~$600K (30%)
  EBITDA Margin:    ~30%

OPERATIONS
  Employees:        5+ (Non-Union)
  Market Focus:     95% Residential / 5% Commercial
  Service Area:     West Virginia & Ohio
  Years in Business: 39

SERVICE MIX
  Install & Retrofit:     50%
  Service & Maintenance:  50%

PROJECT SIZE
  Average Job:      $300 – $12K
  Largest Project:  $30K

OWNERSHIP & TRANSITION
  Owner:            Husband & wife (Beckie Wells)
  Key Employees:    None
  Transition Plan:  Owners planning to retire

──────────────────────────────────

KEY HIGHLIGHTS
  - Nearly 4 decades of operating history and brand recognition
  - Strong EBITDA margins (30%)
  - Balanced revenue split between install and service/maintenance
  - Lean operation with 5+ employees
  - Clean transition — owners retiring, no key employee risk
  - Established presence across West Virginia and Ohio

──────────────────────────────────

CONTACT
  (304) 481-1320
  NWells@a1heatingandcooling.com`

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
    `- Email:   ${lead.email}`,
  ].join('\n')

  const system =
`You are a senior M&A analyst at Summit Mergers writing a one-page company snapshot for an HVAC acquisition memo.

Voice: plain, factual, confident. No fluff, no hype, no sales language.
Constraint: use ONLY the facts the user provides. Never invent metrics, history, customers, or context that isn't in the input.

Format requirements (match exactly):
- Plain text only — no markdown, no backticks.
- ALL-CAPS section headers, no leading whitespace.
- Two-space indentation for data rows under each header.
- Align values in a column by padding labels with spaces (look at the example).
- Use the long-dash divider "──────────────────────────────────" between major blocks.
- KEY HIGHLIGHTS section has 5-7 bullets, each starting with "  - ".
- Bullets synthesise the strongest, most defensible selling points from the data — operating history, margin quality, revenue mix, service area, transition story, etc.
- Do NOT add headers for empty data (skip the section if no fields apply).
- Final block is CONTACT — name, phone, email (skip rows that are blank).

Output ONLY the snapshot text — no commentary, no preamble, no trailing explanation.`

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

Write the snapshot for this company now. Plain text only.`

  return { system, user }
}

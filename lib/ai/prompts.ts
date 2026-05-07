/**
 * lib/ai/prompts.ts
 *
 * All prompt builders for the AI enrichment system.
 *
 * Design principles:
 *  1. System prompt = persona + output schema + constraints
 *  2. User prompt  = data only (no instructions mixed in)
 *  3. Always request JSON output — use response_format: json_object
 *  4. Always set max_tokens to prevent runaway completions
 *  5. Negative instructions prevent common AI failure modes
 *  6. Never include PII beyond what is needed for the specific task
 */

import type { AiTone } from './types'

// ── Lead data shape used across all prompts ───────────────────────────────
export interface LeadPromptData {
  first_name:  string | null
  last_name:   string | null
  title:       string | null
  company:     string | null
  website:     string | null
  email:       string
  industry?:   string | null
  linkedin?:   string | null
  notes?:      string   // recent notes as context
}

export interface SenderPromptData {
  name:    string
  email:   string
  company: string
}

// ── Tone descriptors used in prompts ──────────────────────────────────────
const TONE_DESCRIPTORS: Record<AiTone, string> = {
  professional: 'professional, concise, and respectful. Use formal but approachable language.',
  casual:       'casual and conversational. Write like a colleague reaching out, not a sales rep.',
  direct:       'direct and to-the-point. No fluff. Get to the value proposition in the first two sentences.',
  friendly:     'warm and friendly. Show genuine curiosity about their work before mentioning your product.',
}

// ── Email draft prompt ────────────────────────────────────────────────────
export function buildEmailDraftPrompt(
  lead:         LeadPromptData,
  sender:       SenderPromptData,
  tone:         AiTone,
  templateHint: string,
  context:      string,
): { system: string; user: string } {
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'there'

  const system = `You are an expert B2B cold outreach copywriter.
Write a personalised cold email in a ${TONE_DESCRIPTORS[tone]}
Rules:
- Maximum 150 words in the body. Brevity is more persuasive.
- Be specific to the lead's company (${lead.company ?? 'their company'}) and role (${lead.title ?? 'their role'}).
- Do NOT use generic filler phrases like "I hope this finds you well", "I wanted to reach out", "touching base", or "synergy".
- Do NOT include "{{" or "}}" placeholders — personalise directly.
- The email must feel human-written, not AI-generated.
- Open with a genuine observation about their work, role, or company.
- One clear call to action: a short call or reply.
- Sign off with the sender's first name only.
Output strict JSON matching this schema:
{
  "subject": "string (max 60 chars, no clickbait, no all-caps)",
  "body_html": "string (clean HTML, use <p> for paragraphs, <strong> for emphasis only when needed)",
  "body_text": "string (plain text version)"
}`

  const user = `Sender:
- Name: ${sender.name}
- Email: ${sender.email}
- Company: ${sender.company}

Lead:
- Name: ${leadName}
- Title: ${lead.title ?? 'Unknown'}
- Company: ${lead.company ?? 'Unknown'}
- Website: ${lead.website ?? 'Not provided'}
${lead.industry ? `- Industry: ${lead.industry}` : ''}
${lead.notes ? `\nRecent notes about this lead:\n${lead.notes}` : ''}
${templateHint ? `\nBase template / angle to personalise:\n${templateHint}` : ''}
${context ? `\nAdditional instructions from the user:\n${context}` : ''}`

  return { system, user }
}

// ── Subject line prompt ───────────────────────────────────────────────────
export function buildSubjectLinePrompt(
  lead:      LeadPromptData,
  emailBody: string,
  count:     number,
): { system: string; user: string } {
  const system = `You are a B2B cold email subject line specialist.
Generate exactly ${count} subject line options.
Rules:
- Each under 60 characters
- No clickbait, no emojis, no all-caps words
- No questions that feel manipulative ("Are you struggling with...?")
- Specific to the lead's company or role, not generic
- Conversational tone — sounds like a peer reaching out
- Variety: options should have meaningfully different angles
Output strict JSON: { "subjects": ["string", "string", "string"] }`

  const user = `Lead: ${lead.first_name ?? ''} ${lead.last_name ?? ''} — ${lead.title ?? ''} at ${lead.company ?? 'their company'}
${emailBody ? `\nEmail body context:\n${emailBody.slice(0, 500)}` : ''}`

  return { system, user }
}

// ── Follow-up suggestion prompt ───────────────────────────────────────────
export function buildFollowUpPrompt(
  lead:           LeadPromptData,
  activityHistory:string,
): { system: string; user: string } {
  const system = `You are an expert cold outreach coach helping a sales rep plan their next follow-up.
Based on the lead's engagement history, suggest:
1. The optimal number of days to wait before following up
2. A brief, non-pushy follow-up email
Rules:
- If no engagement (no opens, no replies): suggest 3–5 days
- If opened but no reply: suggest 2–3 days, reference the open subtly
- If replied: do not suggest a follow-up — return suggested_days: -1 and a note in reason
- Keep the email under 100 words
- Do NOT be aggressive or use urgency tactics
Output strict JSON:
{
  "suggested_days": number,
  "reason": "string (1 sentence explaining timing)",
  "subject": "string",
  "body_text": "string"
}`

  const user = `Lead: ${lead.first_name ?? ''} ${lead.last_name ?? ''} — ${lead.title ?? ''} at ${lead.company ?? ''}

Outreach history (most recent first):
${activityHistory || 'No prior outreach recorded.'}`

  return { system, user }
}

// ── Lead summary prompt ───────────────────────────────────────────────────
export function buildLeadSummaryPrompt(
  lead: LeadPromptData,
): { system: string; user: string } {
  const system = `You are a B2B sales intelligence assistant.
Generate a concise profile summary for a lead that helps a sales rep personalise their outreach.
Output strict JSON:
{
  "summary": "string (2–3 sentences, focus on role, company, and likely pain points)",
  "key_facts": ["string", "string", "string"]
}
Rules for key_facts:
- 3 specific, actionable insights
- Based only on the data provided — do not hallucinate
- Focus on what makes this lead a good fit for outreach
- If data is sparse, note what is missing`

  const user = `Lead:
- Name: ${[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown'}
- Title: ${lead.title ?? 'Unknown'}
- Company: ${lead.company ?? 'Unknown'}
- Website: ${lead.website ?? 'Not provided'}
${lead.industry ? `- Industry: ${lead.industry}` : ''}
${lead.notes ? `\nNotes:\n${lead.notes.slice(0, 400)}` : ''}`

  return { system, user }
}

// ── Batch email personalisation prompt ────────────────────────────────────
export function buildBatchEmailPrompt(
  lead:         LeadPromptData,
  sender:       SenderPromptData,
  tone:         AiTone,
  templateHint: string,
): { system: string; user: string } {
  // Same as draft but tighter constraints for batch (cost control)
  const system = `You are a cold outreach copywriter. Write a personalised cold email.
Tone: ${TONE_DESCRIPTORS[tone]}
Rules:
- Maximum 120 words in the body
- Personalise to the specific person and company
- No generic phrases, no filler, no "I hope this email finds you well"
- One clear call to action
Output strict JSON: { "subject": "string", "body_html": "string", "body_text": "string" }`

  const user = `Sender: ${sender.name} <${sender.email}> at ${sender.company}
Lead: ${[lead.first_name, lead.last_name].filter(Boolean).join(' ')} — ${lead.title ?? ''} at ${lead.company ?? ''}
${lead.website ? `Website: ${lead.website}` : ''}
${templateHint ? `Base template:\n${templateHint}` : ''}`

  return { system, user }
}

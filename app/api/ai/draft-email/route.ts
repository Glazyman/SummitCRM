/**
 * POST /api/ai/draft-email
 *
 * Generates a personalised cold email draft for a single lead.
 * Uses gpt-4o — highest quality, interactive use only.
 *
 * The draft is NOT saved to the DB; the client receives it and
 * must confirm before it is sent via POST /api/emails/send.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { isAiEnabled, generateEmailDraft, checkBudget, logUsage } from '@/lib/ai'
import { rateLimit, rateLimitResponse, AI_LIMIT } from '@/lib/security/rate-limit'

const schema = z.object({
  lead_id:            z.string().uuid(),
  tone:               z.enum(['professional', 'casual', 'direct', 'friendly']).default('professional'),
  context:            z.string().max(500).optional(),
  template_hint:      z.string().max(1000).optional(),
  sending_account_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  try {
    if (!isAiEnabled()) {
      return NextResponse.json({ error: 'AI features are not enabled' }, { status: 503 })
    }

    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body   = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })

    const { lead_id, tone, context, template_hint, sending_account_id } = parsed.data

    const adminClient = createAdminClient()

    // Get workspace + verify role (viewers cannot use AI)
    const { data: member } = await (adminClient as any)
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    // Rate limit per workspace
    const rl = rateLimit(member.workspace_id, AI_LIMIT.prefix, AI_LIMIT.limit, AI_LIMIT.windowMs)
    if (!rl.success) return rateLimitResponse(rl.resetIn)

    // Budget check — block if 100% used
    const budget = await checkBudget(member.workspace_id)
    if (!budget.allowed) {
      return NextResponse.json({
        error:   'Monthly AI token budget reached. Contact your admin to increase the limit.',
        budget,
      }, { status: 429 })
    }

    // Load lead + sending account
    const [{ data: lead }, { data: account }] = await Promise.all([
      (adminClient as any)
        .from('leads')
        .select('id, first_name, last_name, title, company, website, email')
        .eq('id', lead_id)
        .eq('workspace_id', member.workspace_id)
        .single(),
      (adminClient as any)
        .from('sending_accounts')
        .select('id, from_name, from_email')
        .eq('id', sending_account_id)
        .eq('workspace_id', member.workspace_id)
        .single(),
    ]) as [
      { data: { id: string; first_name: string | null; last_name: string | null; title: string | null; company: string | null; website: string | null; email: string } | null },
      { data: { id: string; from_name: string; from_email: string } | null }
    ]

    if (!lead)    return NextResponse.json({ error: 'Lead not found' },           { status: 404 })
    if (!account) return NextResponse.json({ error: 'Sending account not found' }, { status: 404 })

    // Get workspace name for sender context
    const { data: workspace } = await (adminClient as any)
      .from('workspaces')
      .select('name')
      .eq('id', member.workspace_id)
      .single() as { data: { name: string } | null }

    // Generate
    const result = await generateEmailDraft({
      lead: {
        first_name: lead.first_name,
        last_name:  lead.last_name,
        title:      lead.title,
        company:    lead.company,
        website:    lead.website,
        email:      lead.email,
      },
      sender: {
        name:    account.from_name,
        email:   account.from_email,
        company: workspace?.name ?? 'our company',
      },
      tone,
      templateHint: template_hint,
      context,
    })

    // Log usage (async, non-blocking)
    void logUsage({
      workspaceId:      member.workspace_id,
      userId:           user.id,
      model:            result.model,
      task:             'email_draft',
      leadId:           lead_id,
      promptTokens:     result.usage.prompt,
      completionTokens: result.usage.completion,
      cached:           result.cached,
    })

    return NextResponse.json({
      subject:     result.subject,
      body_html:   result.body_html,
      body_text:   result.body_text,
      tokens_used: result.tokens_used,
      cached:      result.cached,
      model:       result.model,
      budget: {
        used_pct: budget.used_pct,
        warning:  budget.warning,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('OPENAI_API_KEY')) {
      return NextResponse.json({ error: 'AI is not configured. Add OPENAI_API_KEY to your environment.' }, { status: 503 })
    }
    console.error('[POST /api/ai/draft-email]', err)
    return NextResponse.json({ error: 'AI draft generation failed. Please try again.' }, { status: 500 })
  }
}

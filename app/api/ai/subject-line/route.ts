/**
 * POST /api/ai/subject-line
 *
 * Generates N subject line options for a lead.
 * Uses gpt-4o-mini (fast, cheap — called frequently from compose modal).
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { isAiEnabled, generateSubjectLines, checkBudget, logUsage } from '@/lib/ai'

const schema = z.object({
  lead_id:    z.string().uuid(),
  email_body: z.string().max(2000).optional(),
  count:      z.number().int().min(1).max(5).default(3),
})

export async function POST(req: Request) {
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
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    const { lead_id, email_body, count } = parsed.data
    const adminClient = createAdminClient()

    const { data: member } = await adminClient
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string } | null }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const budget = await checkBudget(member.workspace_id)
    if (!budget.allowed) {
      return NextResponse.json({ error: 'Monthly AI token budget reached.' }, { status: 429 })
    }

    const { data: lead } = await adminClient
      .from('leads')
      .select('first_name, last_name, title, company, website, email')
      .eq('id', lead_id)
      .eq('workspace_id', member.workspace_id)
      .single() as {
        data: { first_name: string | null; last_name: string | null; title: string | null; company: string | null; website: string | null; email: string } | null
      }

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const result = await generateSubjectLines({ lead: { ...lead, linkedin: null }, emailBody: email_body, count })

    void logUsage({
      workspaceId:      member.workspace_id,
      userId:           user.id,
      model:            'gpt-4o-mini',
      task:             'subject_line',
      leadId:           lead_id,
      promptTokens:     result.usage.prompt,
      completionTokens: result.usage.completion,
      cached:           result.cached,
    })

    return NextResponse.json({
      subjects:    result.subjects,
      tokens_used: result.tokens_used,
      cached:      result.cached,
    })
  } catch (err) {
    console.error('[POST /api/ai/subject-line]', err)
    return NextResponse.json({ error: 'Subject line generation failed.' }, { status: 500 })
  }
}

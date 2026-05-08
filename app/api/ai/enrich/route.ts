import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateLeadSummary } from '@/lib/ai/tasks'
import { logUsage } from '@/lib/ai/usage'
import type { LeadPromptData } from '@/lib/ai/prompts'

// POST /api/ai/enrich — generate AI summary/enrichment for a lead
export async function POST(req: NextRequest) {
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { lead_id } = body

  if (!lead_id) return NextResponse.json({ error: 'lead_id is required' }, { status: 400 })

  // Fetch the lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, company, title, website, linkedin_url, ai_summary')
    .eq('id', lead_id)
    .eq('workspace_id', member.workspace_id)
    .single()

  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const promptData: LeadPromptData = {
    first_name: (lead as any).first_name ?? null,
    last_name:  (lead as any).last_name  ?? null,
    email:      (lead as any).email,
    company:    (lead as any).company    ?? null,
    title:      (lead as any).title      ?? null,
    website:    (lead as any).website    ?? null,
    linkedin:   (lead as any).linkedin_url ?? null,
  }

  let result
  try {
    result = await generateLeadSummary({ lead: promptData })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI generation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Persist summary to lead
  await supabase
    .from('leads')
    .update({ ai_summary: result.summary })
    .eq('id', lead_id)

  // Log AI usage
  if (!result.cached) {
    await logUsage({
      workspaceId: member.workspace_id,
      userId:      user.id,
      model:       'gpt-4o-mini',
      task:        'lead_summary',
      promptTokens:     result.usage.prompt,
      completionTokens: result.usage.completion,
      leadId:      lead_id,
    })

    // Log to activity
    await supabase.from('activity_logs').insert({
      workspace_id: member.workspace_id,
      lead_id,
      user_id:      user.id,
      type:         'ai_draft_generated',
      metadata:     { task: 'lead_summary' },
    })
  }

  return NextResponse.json({
    summary:   result.summary,
    key_facts: result.key_facts,
    cached:    result.cached,
  })
}

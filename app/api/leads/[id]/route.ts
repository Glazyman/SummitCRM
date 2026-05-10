import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import type { LeadStatus, WorkspaceRole } from '@/types/database'

type Params = { params: Promise<{ id: string }> }

// ── GET /api/leads/:id ────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase = (await createServerClient(cookieStore)) as unknown as ReturnType<typeof createAdminClient>

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: WorkspaceRole } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    let leadQuery = supabase
      .from('leads')
      .select('id, first_name, last_name, email, phone, title, company, website, linkedin_url, status, interest_status, pipeline_stage_id, assigned_to, batch_id, ai_summary, custom_fields, created_at, updated_at')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
    if (member.role === 'rep') leadQuery = leadQuery.eq('assigned_to', user.id)
    const { data: lead, error } = await leadQuery.single()

    if (error || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    return NextResponse.json({ lead })
  } catch (err) {
    console.error('[GET /api/leads/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// All current lead_status enum values (original + extended)
const leadStatusSchema = z.enum([
  'new',
  'contacted',
  'replied',
  'interested',
  'not_interested',
  'do_not_contact',
  'unsubscribed',
  'converted',
  'called',
  'emailed',
  'voicemail',
  'no_answer',
  'wrong_number',
  'sold_already',
])

const interestStatusSchema = z.enum(['pending', 'interested', 'not_interested'])

const optionalText = (max: number) => z.string().max(max).nullable().optional()

const patchSchema = z.object({
  first_name:        optionalText(100),
  last_name:         optionalText(100),
  email:             z.string().trim().email().max(320).optional(),
  phone:             optionalText(30),
  title:             optionalText(200),
  company:           optionalText(200),
  website:           optionalText(500),
  linkedin_url:      optionalText(500),
  status:            leadStatusSchema.optional(),
  interest_status:   interestStatusSchema.optional(),
  pipeline_stage_id: z.string().uuid().nullable().optional(),
  assigned_to:       z.string().uuid().nullable().optional(),
})

const nullableTextFields = [
  'first_name',
  'last_name',
  'phone',
  'title',
  'company',
  'website',
  'linkedin_url',
] as const

// Pipeline auto-move rules:
// interest_status → pipeline stage name to move lead into
const INTEREST_PIPELINE_RULES: Record<string, string> = {
  interested: 'Interested',
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase = (await createServerClient(cookieStore)) as unknown as ReturnType<typeof createAdminClient>

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: WorkspaceRole } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const adminClient = createAdminClient()
    const patch = normalizeLeadPatch(parsed.data)
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
    }

    if (patch.assigned_to) {
      const { data: assignee } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', member.workspace_id)
        .eq('user_id', patch.assigned_to)
        .eq('is_active', true)
        .single() as { data: { user_id: string } | null; error: unknown }

      if (!assignee) return NextResponse.json({ error: 'Assignee is not a workspace member' }, { status: 422 })
    }

    const { data: existing } = await supabase
      .from('leads')
      .select('id, status, interest_status, pipeline_stage_id, assigned_to')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .single() as {
        data: {
          id: string
          status: LeadStatus
          interest_status: string | null
          pipeline_stage_id: string | null
          assigned_to: string | null
        } | null
        error: unknown
      }

    if (!existing) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (member.role === 'rep' && existing.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (
      member.role === 'rep' &&
      patch.assigned_to !== undefined &&
      patch.assigned_to !== user.id
    ) {
      return NextResponse.json({ error: 'Reps cannot reassign leads' }, { status: 403 })
    }

    // ── Pipeline auto-move rules ──────────────────────────────────────────
    // If interest_status is changing AND the caller hasn't explicitly set
    // pipeline_stage_id, look up the target stage automatically.
    if (
      patch.interest_status &&
      patch.interest_status !== existing.interest_status &&
      !('pipeline_stage_id' in patch)
    ) {
      const targetStageName = INTEREST_PIPELINE_RULES[patch.interest_status]
      if (targetStageName) {
        const { data: stage } = await (adminClient as any)
          .from('pipeline_stages')
          .select('id')
          .eq('workspace_id', member.workspace_id)
          .ilike('name', targetStageName)
          .single() as { data: { id: string } | null }

        if (stage) {
          patch.pipeline_stage_id = stage.id
        }
      }
    }

    // ── Persist via admin client (bypasses RLS) ───────────────────────────
    const { data: lead, error: updateError } = await adminClient
      .from('leads')
      .update(patch)
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .select(`
        id, workspace_id, first_name, last_name, email, phone, title,
        company, website, linkedin_url, status, interest_status,
        pipeline_stage_id, is_unsubscribed, batch_id, assigned_to,
        ai_summary, custom_fields, created_at, updated_at
      `)
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // ── Activity logs ─────────────────────────────────────────────────────
    const logInserts: object[] = []

    if (patch.status && patch.status !== existing.status) {
      logInserts.push({
        workspace_id: member.workspace_id,
        lead_id: id,
        user_id: user.id,
        type: 'lead_status_changed',
        metadata: { from: existing.status, to: patch.status },
      })
    }

    if (patch.interest_status && patch.interest_status !== existing.interest_status) {
      logInserts.push({
        workspace_id: member.workspace_id,
        lead_id: id,
        user_id: user.id,
        type: 'interest_status_changed',
        metadata: { from: existing.interest_status, to: patch.interest_status },
      })
    }

    if ('assigned_to' in patch && patch.assigned_to !== existing.assigned_to) {
      logInserts.push({
        workspace_id: member.workspace_id,
        lead_id: id,
        user_id: user.id,
        type: 'lead_assigned',
        metadata: { from: existing.assigned_to, to: patch.assigned_to ?? null },
      })
    }

    if (logInserts.length > 0) {
      await adminClient.from('activity_logs').insert(logInserts as never)
    }

    return NextResponse.json({ lead })
  } catch (err) {
    console.error('[PATCH /api/leads/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE /api/leads/:id ─────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase = (await createServerClient(cookieStore)) as unknown as ReturnType<typeof createAdminClient>

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: WorkspaceRole } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Hard delete via admin client (bypasses RLS)
    const admin = createAdminClient()
    const { error } = await admin
      .from('leads')
      .delete()
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/leads/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function normalizeLeadPatch(input: z.infer<typeof patchSchema>) {
  const patch: Record<string, string | null | undefined> = {}

  for (const field of nullableTextFields) {
    if (field in input) {
      const value = input[field]
      patch[field] = value && value.trim() ? value.trim() : null
    }
  }

  if (input.email             !== undefined) patch.email             = input.email.trim().toLowerCase()
  if (input.status            !== undefined) patch.status            = input.status
  if (input.interest_status   !== undefined) patch.interest_status   = input.interest_status
  if (input.pipeline_stage_id !== undefined) patch.pipeline_stage_id = input.pipeline_stage_id
  if (input.assigned_to       !== undefined) patch.assigned_to       = input.assigned_to

  return patch as Partial<{
    first_name:        string | null
    last_name:         string | null
    email:             string
    phone:             string | null
    title:             string | null
    company:           string | null
    website:           string | null
    linkedin_url:      string | null
    status:            LeadStatus
    interest_status:   string
    pipeline_stage_id: string | null
    assigned_to:       string | null
  }>
}

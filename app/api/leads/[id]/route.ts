import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import type { LeadStatus, WorkspaceRole, CallOutcome } from '@/types/database'

// Statuses that represent a call attempt — auto-log a call_log row when set
const STATUS_TO_CALL_OUTCOME: Partial<Record<LeadStatus, CallOutcome>> = {
  called:       'answered',
  voicemail:    'voicemail',
  no_answer:    'no_answer',
  wrong_number: 'wrong_number',
  sold_already: 'answered',
}

// Default follow-up time for auto-suggestions — change this number to adjust (24-hour format)
const DEFAULT_FOLLOWUP_HOUR = 11 // 11 AM

function followUpSuggestionForStatus(status: LeadStatus) {
  if (status === 'voicemail') {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(DEFAULT_FOLLOWUP_HOUR, 0, 0, 0)
    return {
      title:  'Follow up after voicemail',
      notes:  'Left voicemail. Try again tomorrow morning.',
      due_at: d.toISOString(),
    }
  }
  if (status === 'no_answer') {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(DEFAULT_FOLLOWUP_HOUR, 0, 0, 0)
    return {
      title:  'Follow up after no answer',
      notes:  'No answer. Retry tomorrow morning.',
      due_at: d.toISOString(),
    }
  }
  return null
}

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

// US state codes (50 + DC) or empty string (clear field).
const stateField = z.union([
  z.literal(''),
  z.string().regex(/^[A-Z]{2}$/),
]).nullable().optional()

const patchSchema = z.object({
  first_name:        optionalText(100),
  last_name:         optionalText(100),
  email:             z.union([z.string().trim().email().max(320), z.literal('')]).optional(),
  phone:             optionalText(30),
  title:             optionalText(200),
  company:           optionalText(200),
  website:           optionalText(500),
  linkedin_url:      optionalText(500),
  status:            leadStatusSchema.optional(),
  interest_status:   interestStatusSchema.optional(),
  pipeline_stage_id: z.string().uuid().nullable().optional(),
  assigned_to:       z.string().uuid().nullable().optional(),
  // Stored inside leads.custom_fields, not as top-level columns.
  contact_state:     stateField,
  company_state:     stateField,
})

const CUSTOM_FIELDS_KEYS = ['contact_state', 'company_state'] as const
type CustomFieldKey = typeof CUSTOM_FIELDS_KEYS[number]

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
    const willTouchCustomFields = CUSTOM_FIELDS_KEYS.some((k) => k in parsed.data)
    if (Object.keys(patch).length === 0 && !willTouchCustomFields) {
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
      .select('id, status, interest_status, pipeline_stage_id, assigned_to, custom_fields')
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
          custom_fields: Record<string, unknown> | null
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

    // ── custom_fields merge (contact_state / company_state) ──────────────
    // These fields live inside the jsonb column. Merge into the existing
    // object so other custom keys (e.g. revenue) aren't clobbered. Empty
    // string clears the key.
    const customFieldsPatch: Record<string, string> = {}
    let touchedCustomFields = false
    for (const key of CUSTOM_FIELDS_KEYS) {
      if (key in parsed.data) {
        touchedCustomFields = true
        const value = parsed.data[key as CustomFieldKey]
        if (value && value.length > 0) customFieldsPatch[key] = value
      }
    }
    if (touchedCustomFields) {
      const existingFields = (existing.custom_fields ?? {}) as Record<string, unknown>
      const merged: Record<string, unknown> = { ...existingFields, ...customFieldsPatch }
      // Empty / null state input means "clear" — remove the key entirely.
      for (const key of CUSTOM_FIELDS_KEYS) {
        if (key in parsed.data && !customFieldsPatch[key]) delete merged[key]
      }
      ;(patch as Record<string, unknown>).custom_fields = merged
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

      // Auto-log a call when switching to a call-related status. Capture
      // the inserted call_logs.id so the paired activity_log can reference
      // it — letting the activity-DELETE handler cascade-remove the call.
      const callOutcome = STATUS_TO_CALL_OUTCOME[patch.status]
      if (callOutcome) {
        const { data: insertedCall } = await adminClient
          .from('call_logs')
          .insert({
            lead_id:      id,
            workspace_id: member.workspace_id,
            logged_by:    user.id,
            outcome:      callOutcome,
            duration_sec: null,
            notes:        null,
          })
          .select('id')
          .single() as { data: { id: string } | null }

        if (insertedCall) {
          logInserts.push({
            workspace_id: member.workspace_id,
            lead_id:      id,
            user_id:      user.id,
            type:         'call_logged',
            metadata:     {
              outcome:      callOutcome,
              duration_sec: null,
              auto_logged:  true,
              call_log_id:  insertedCall.id,
            },
          })
        }
      }
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

    const followUpSuggestion = patch.status ? followUpSuggestionForStatus(patch.status as LeadStatus) : null
    return NextResponse.json({ lead, follow_up_suggestion: followUpSuggestion })
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

  if (input.email !== undefined && input.email.trim() !== '') patch.email = input.email.trim().toLowerCase()
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

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import type { LeadStatus, WorkspaceRole } from '@/types/database'

type Params = { params: Promise<{ id: string }> }

const leadStatusSchema = z.enum([
  'new',
  'contacted',
  'replied',
  'interested',
  'not_interested',
  'do_not_contact',
  'unsubscribed',
  'converted',
])

const optionalText = (max: number) => z.string().max(max).nullable().optional()

const patchSchema = z.object({
  first_name: optionalText(100),
  last_name: optionalText(100),
  email: z.string().trim().email().max(320).optional(),
  phone: optionalText(30),
  title: optionalText(200),
  company: optionalText(200),
  website: optionalText(500),
  linkedin_url: optionalText(500),
  status: leadStatusSchema.optional(),
  assigned_to: z.string().uuid().nullable().optional(),
})

const nullableFields = [
  'first_name',
  'last_name',
  'phone',
  'title',
  'company',
  'website',
  'linkedin_url',
] as const

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
    if (member.role === 'viewer') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const patch = normalizeLeadPatch(parsed.data)
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
    }

    if ('assigned_to' in patch && !['super_admin', 'admin', 'manager'].includes(member.role)) {
      return NextResponse.json({ error: 'Manager access required to assign leads' }, { status: 403 })
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
      .select('id, status, assigned_to')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .single() as { data: { id: string; status: LeadStatus; assigned_to: string | null } | null; error: unknown }

    if (!existing) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const { data: lead, error: updateError } = await supabase
      .from('leads')
      .update(patch)
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .select('id, workspace_id, first_name, last_name, email, phone, title, company, website, linkedin_url, status, is_unsubscribed, batch_id, assigned_to, source, ai_summary, custom_fields, created_at, updated_at')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const adminClient = createAdminClient()
    if (patch.status && patch.status !== existing.status) {
      await adminClient.from('activity_logs').insert({
        workspace_id: member.workspace_id,
        lead_id: id,
        user_id: user.id,
        type: 'lead_status_changed',
        metadata: { from: existing.status, to: patch.status },
      })
    }

    if ('assigned_to' in patch && patch.assigned_to !== existing.assigned_to) {
      await adminClient.from('activity_logs').insert({
        workspace_id: member.workspace_id,
        lead_id: id,
        user_id: user.id,
        type: 'lead_assigned',
        metadata: { from: existing.assigned_to, to: patch.assigned_to ?? null },
      })
    }

    return NextResponse.json({ lead })
  } catch (err) {
    console.error('[PATCH /api/leads/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function normalizeLeadPatch(input: z.infer<typeof patchSchema>) {
  const patch: Record<string, string | null> = {}

  for (const field of nullableFields) {
    if (field in input) {
      const value = input[field]
      patch[field] = value && value.trim() ? value.trim() : null
    }
  }

  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase()
  if (input.status !== undefined) patch.status = input.status
  if (input.assigned_to !== undefined) patch.assigned_to = input.assigned_to

  return patch as Partial<{
    first_name: string | null
    last_name: string | null
    email: string
    phone: string | null
    title: string | null
    company: string | null
    website: string | null
    linkedin_url: string | null
    status: LeadStatus
    assigned_to: string | null
  }>
}

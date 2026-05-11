import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

// GET /api/leads/[id]/questionnaire
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient() as any
    const { data: lead } = await admin
      .from('leads')
      .select('custom_fields, workspace_id')
      .eq('id', id)
      .single()

    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const questionnaire = (lead.custom_fields as Record<string, unknown>)?._questionnaire ?? null
    return NextResponse.json({ questionnaire })
  } catch (err) {
    console.error('[GET questionnaire]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/leads/[id]/questionnaire
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { answers, questions } = body

    const admin = createAdminClient() as any

    // Verify lead exists and belongs to user's workspace
    const { data: member } = await admin
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const { data: lead } = await admin
      .from('leads')
      .select('id, custom_fields')
      .eq('id', id)
      .eq('workspace_id', member.workspace_id)
      .single()

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Merge questionnaire into existing custom_fields
    const existingFields = (lead.custom_fields as Record<string, unknown>) ?? {}
    const updatedFields  = {
      ...existingFields,
      _questionnaire: { answers, questions, updated_at: new Date().toISOString() },
    }

    const { error } = await admin
      .from('leads')
      .update({ custom_fields: updatedFields, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PATCH questionnaire]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

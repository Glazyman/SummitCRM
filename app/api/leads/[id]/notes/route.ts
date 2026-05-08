import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

const createNoteSchema = z.object({
  content: z.string().trim().min(1).max(5000),
})

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: leadId } = await params
    const cookieStore = await cookies()
    const supabase = (await createServerClient(cookieStore)) as unknown as ReturnType<typeof createAdminClient>

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const body = await req.json()
    const parsed = createNoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .single() as { data: { id: string } | null; error: unknown }

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const { data: note, error } = await supabase
      .from('notes')
      .insert({
        workspace_id: member.workspace_id,
        lead_id: leadId,
        author_id: user.id,
        content: parsed.data.content,
      })
      .select('id, lead_id, author_id, content, created_at, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!note) return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })

    return NextResponse.json({ note }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/leads/[id]/notes]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

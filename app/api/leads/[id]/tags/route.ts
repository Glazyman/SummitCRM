import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/leads/[id]/tags — add tag to lead
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { tag_id } = body
  if (!tag_id) return NextResponse.json({ error: 'tag_id is required' }, { status: 400 })

  const { error } = await supabase
    .from('lead_tags')
    .insert({ lead_id: leadId, tag_id })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ success: true }) // already added
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}

// DELETE /api/leads/[id]/tags?tag_id=xxx — remove tag from lead
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const supabase = await createClient() as any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tagId = req.nextUrl.searchParams.get('tag_id')
  if (!tagId) return NextResponse.json({ error: 'tag_id is required' }, { status: 400 })

  const { error } = await supabase
    .from('lead_tags')
    .delete()
    .eq('lead_id', leadId)
    .eq('tag_id', tagId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

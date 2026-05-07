import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const page    = parseInt(url.searchParams.get('page')  ?? '1')
  const limit   = parseInt(url.searchParams.get('limit') ?? '20')
  const type    = url.searchParams.get('type')
  const unread  = url.searchParams.get('unread')
  const offset  = (page - 1) * limit

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (type)           query = query.eq('type', type)
  if (unread === '1') query = query.eq('is_read', false)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    notifications: data ?? [],
    total: count ?? 0,
    page,
    limit,
  })
}

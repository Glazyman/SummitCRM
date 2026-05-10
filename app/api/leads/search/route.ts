/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    if (q.length < 2) return NextResponse.json({ leads: [] })

    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: member } = await (admin as any)
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    let query = (admin as any)
      .from('leads')
      .select('id, first_name, last_name, email, phone, company, title, status')
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
      .order('updated_at', { ascending: false })
      .limit(12)

    if (member.role === 'rep') {
      query = query.eq('assigned_to', user.id)
    }

    const { data } = await query

    const leads = (data ?? []).map((lead: any) => ({
      id: lead.id,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      title: lead.title,
      status: lead.status,
    }))

    return NextResponse.json({ leads })
  } catch (err) {
    console.error('[GET /api/leads/search]', err)
    return NextResponse.json({ error: 'Failed to search leads' }, { status: 500 })
  }
}

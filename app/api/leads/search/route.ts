/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActor } from '@/lib/auth/actor'

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    if (q.length < 2) return NextResponse.json({ leads: [] })

    // Effective actor — an admin viewing-as a rep searches only the rep's leads.
    const actor = await getActor()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const member = { workspace_id: actor.workspaceId, role: actor.role }
    const user = { id: actor.userId }

    let query = (admin as any)
      .from('leads')
      .select('id, first_name, last_name, email, phone, company, title, status')
      .eq('workspace_id', member.workspace_id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(12)

    // Match every whitespace-separated token somewhere across name/email/
    // company/title. Each .or() is AND-combined, so "John Smith" needs BOTH
    // "john" and "smith" to match (first matches first_name, second last_name)
    // — fixing the old "%full query%" against a single column that never
    // matched a two-word name. Strip PostgREST filter-breaking chars per token.
    const tokens = q.split(/\s+/)
      .map((t) => t.replace(/[%,()*\\]/g, '').trim())
      .filter((t) => t.length > 0)
    for (const tok of tokens) {
      query = query.or(
        `first_name.ilike.%${tok}%,last_name.ilike.%${tok}%,email.ilike.%${tok}%,company.ilike.%${tok}%,title.ilike.%${tok}%`,
      )
    }

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

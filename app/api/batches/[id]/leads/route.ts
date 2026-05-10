import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiSuccess, apiError, apiUnauthorized, apiServerError } from '@/lib/utils/api'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id: batchId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiUnauthorized()

    const { data: memberRow } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
    const member = memberRow as { workspace_id: string; role: string } | null

    if (!member) return apiUnauthorized()

    const { data: batch } = await supabase
      .from('lead_batches')
      .select('id, name, created_at')
      .eq('id', batchId)
      .eq('workspace_id', member.workspace_id)
      .single()

    if (!batch) return apiError('Batch not found', 404)

    let leadsQuery = supabase
      .from('leads')
      .select('id, first_name, last_name, email, phone, company, title, status, custom_fields, created_at')
      .eq('workspace_id', member.workspace_id)
      .eq('batch_id', batchId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (member.role === 'rep') {
      leadsQuery = leadsQuery.eq('assigned_to', user.id)
    }

    const { data: leads, error: leadsError } = await leadsQuery
    if (leadsError) return apiServerError(leadsError)

    return apiSuccess({ batch, leads: leads ?? [] })
  } catch (err) {
    return apiServerError(err)
  }
}

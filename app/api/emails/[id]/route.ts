/**
 * GET /api/emails/[id]
 * Returns full email record (without raw credentials).
 * Auth: rep+
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id: emailId } = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single() as { data: { workspace_id: string } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

    const { data: email, error } = await supabase
      .from('emails')
      .select(
        'id, lead_id, sending_account_id, sent_by, subject, body_html, body_text, ' +
        'status, resend_message_id, scheduled_for, sent_at, opened_at, ' +
        'clicked_at, replied_at, bounced_at, bounce_reason, created_at, ' +
        'sending_accounts(name, from_email, from_name)'
      )
      .eq('id', emailId)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: Record<string, unknown> | null; error: unknown }

    if (error || !email) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ email })
  } catch (err) {
    console.error('[emails/[id] GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

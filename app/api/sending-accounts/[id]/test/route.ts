/**
 * POST /api/sending-accounts/[id]/test
 * Send a test email to verify the account is configured correctly.
 * Auth: admin+
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { testSendingAccount } from '@/lib/email/sender'

const schema = z.object({
  recipient: z.string().email().optional(),  // defaults to the admin's own email
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: accountId } = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

    if (!member || !['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body   = await req.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    const recipient = parsed.success && parsed.data.recipient
      ? parsed.data.recipient
      : user.email!

    // Fetch account with vault references
    const { data: account } = await supabase
      .from('sending_accounts')
      .select(
        'id, type, from_email, from_name, is_active, ' +
        'resend_key_id, smtp_host, smtp_port, smtp_user, smtp_pass_id, smtp_secure'
      )
      .eq('id', accountId)
      .eq('workspace_id', member.workspace_id)
      .single() as {
        data: {
          id: string; type: 'resend' | 'smtp'; from_email: string; from_name: string
          is_active: boolean; resend_key_id: string | null
          smtp_host: string | null; smtp_port: number | null; smtp_user: string | null
          smtp_pass_id: string | null; smtp_secure: boolean
        } | null
        error: unknown
      }

    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    if (!account.is_active) return NextResponse.json({ error: 'Account is inactive' }, { status: 400 })

    const result    = await testSendingAccount(account, recipient)
    const adminClient = createAdminClient()

    if (result.success) {
      await adminClient
        .from('sending_accounts')
        .update({ last_tested_at: new Date().toISOString(), last_error: null })
        .eq('id', accountId)
    } else {
      await adminClient
        .from('sending_accounts')
        .update({ last_error: result.error ?? 'Test failed' })
        .eq('id', accountId)
    }

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err) {
    console.error('[sending-accounts/test]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

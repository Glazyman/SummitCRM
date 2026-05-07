/**
 * PATCH  /api/sending-accounts/[id]  — update account settings
 * DELETE /api/sending-accounts/[id]  — soft-delete (deactivate) account
 *
 * Auth: admin+
 * If credentials are re-submitted, the old vault secrets are replaced.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { storeSecret, deleteSecret } from '@/lib/email/vault'

const patchSchema = z.object({
  name:           z.string().min(1).max(100).optional(),
  from_email:     z.string().email().optional(),
  from_name:      z.string().min(1).max(100).optional(),
  daily_limit:    z.number().int().min(1).max(500).optional(),
  is_active:      z.boolean().optional(),
  resend_api_key: z.string().min(10).optional(),
  smtp_host:      z.string().optional(),
  smtp_port:      z.number().int().min(1).max(65535).optional(),
  smtp_user:      z.string().optional(),
  smtp_pass:      z.string().optional(),
  smtp_secure:    z.boolean().optional(),
})

type Params = { params: Promise<{ id: string }> }

// ── PATCH ─────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: accountId } = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const adminClient = createAdminClient()

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

    // Confirm account belongs to workspace
    const { data: existing } = await supabase
      .from('sending_accounts')
      .select('id, type, resend_key_id, smtp_pass_id')
      .eq('id', accountId)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: { id: string; type: string; resend_key_id: string | null; smtp_pass_id: string | null } | null; error: unknown }

    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body   = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const { resend_api_key, smtp_pass, ...fields } = parsed.data
    const update: Record<string, unknown> = { ...fields }

    // Re-encrypt credentials if new ones provided
    if (resend_api_key) {
      if (existing.resend_key_id) await deleteSecret(existing.resend_key_id)
      const newKeyId = await storeSecret(resend_api_key, `resend_key_${accountId}`)
      update.resend_key_id = newKeyId
    }
    if (smtp_pass) {
      if (existing.smtp_pass_id) await deleteSecret(existing.smtp_pass_id)
      const newPassId = await storeSecret(smtp_pass, `smtp_pass_${accountId}`)
      update.smtp_pass_id = newPassId
    }

    const { error: updateError } = await adminClient
      .from('sending_accounts')
      .update(update)
      .eq('id', accountId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[sending-accounts PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id: accountId } = await params
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const adminClient = createAdminClient()

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

    const { data: existing } = await supabase
      .from('sending_accounts')
      .select('id, resend_key_id, smtp_pass_id')
      .eq('id', accountId)
      .eq('workspace_id', member.workspace_id)
      .single() as { data: { id: string; resend_key_id: string | null; smtp_pass_id: string | null } | null; error: unknown }

    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Clean up vault secrets
    if (existing.resend_key_id) await deleteSecret(existing.resend_key_id).catch(() => {})
    if (existing.smtp_pass_id)  await deleteSecret(existing.smtp_pass_id).catch(() => {})

    // Soft-delete: deactivate rather than hard delete (preserves email history)
    await adminClient
      .from('sending_accounts')
      .update({ is_active: false, resend_key_id: null, smtp_pass_id: null })
      .eq('id', accountId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[sending-accounts DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

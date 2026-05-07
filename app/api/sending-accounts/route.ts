/**
 * GET  /api/sending-accounts   — list workspace sending accounts
 * POST /api/sending-accounts   — create a new sending account
 *
 * Auth: admin+
 * Credentials (API key / SMTP pass) are encrypted via Vault before storage.
 * Raw credentials are NEVER returned in any response.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { storeSecret } from '@/lib/email/vault'
import { auditLog } from '@/lib/security/audit'
import type { SendingAccountPublic } from '@/lib/email/types'

// ── Validation ────────────────────────────────────────────────────────────
const createSchema = z.discriminatedUnion('type', [
  z.object({
    type:           z.literal('resend'),
    name:           z.string().min(1).max(100),
    from_email:     z.string().email(),
    from_name:      z.string().min(1).max(100),
    daily_limit:    z.number().int().min(1).max(500).default(50),
    resend_api_key: z.string().startsWith('re_').min(10),
  }),
  z.object({
    type:        z.literal('smtp'),
    name:        z.string().min(1).max(100),
    from_email:  z.string().email(),
    from_name:   z.string().min(1).max(100),
    daily_limit: z.number().int().min(1).max(500).default(50),
    smtp_host:   z.string().min(1),
    smtp_port:   z.number().int().min(1).max(65535).default(587),
    smtp_user:   z.string().min(1),
    smtp_pass:   z.string().min(1),
    smtp_secure: z.boolean().default(false),
  }),
])

// ── GET ───────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace + check role
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: accounts, error } = await supabase
      .from('sending_accounts')
      .select(
        'id, name, from_email, from_name, type, daily_limit, emails_sent_today, ' +
        'quota_reset_at, is_active, last_error, last_tested_at, created_at, ' +
        'smtp_host, smtp_port, smtp_user, smtp_secure'
      )
      .eq('workspace_id', member.workspace_id)
      .order('created_at', { ascending: true }) as {
        data: Array<Record<string, unknown>> | null
        error: unknown
      }

    if (error) throw error

    // Enrich with quota info (never leak vault IDs)
    const enriched: SendingAccountPublic[] = (accounts ?? []).map((a) => ({
      ...(a as unknown as SendingAccountPublic),
      quota_remaining: Math.max(0, (a.daily_limit as number) - (a.emails_sent_today as number)),
      quota_percent:   Math.round(((a.emails_sent_today as number) / (a.daily_limit as number)) * 100),
    }))

    return NextResponse.json({ accounts: enriched })
  } catch (err) {
    console.error('[sending-accounts GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase    = await createServerClient(cookieStore)
    const adminClient = createAdminClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .single() as { data: { workspace_id: string; role: string } | null; error: unknown }

    if (!member) return NextResponse.json({ error: 'No workspace' }, { status: 403 })
    if (!['admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 })
    }

    const payload = parsed.data

    // ── Build insert row (without raw credentials) ──────────────────────
    // Insert base record first to get the ID, then store secrets referencing it
    const insertBase: Record<string, unknown> = {
      workspace_id: member.workspace_id,
      name:         payload.name,
      from_email:   payload.from_email,
      from_name:    payload.from_name,
      type:         payload.type,
      daily_limit:  payload.daily_limit,
    }

    if (payload.type === 'smtp') {
      insertBase.smtp_host   = payload.smtp_host
      insertBase.smtp_port   = payload.smtp_port
      insertBase.smtp_user   = payload.smtp_user
      insertBase.smtp_secure = payload.smtp_secure
    }

    const { data: newAccount, error: insertError } = await adminClient
      .from('sending_accounts')
      .insert(insertBase)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }

    if (insertError || !newAccount) {
      throw new Error(`Insert failed: ${JSON.stringify(insertError)}`)
    }

    const accountId = newAccount.id

    // ── Encrypt and store credentials ────────────────────────────────────
    if (payload.type === 'resend') {
      const keyId = await storeSecret(
        payload.resend_api_key,
        `resend_key_${accountId}`
      )
      await adminClient
        .from('sending_accounts')
        .update({ resend_key_id: keyId })
        .eq('id', accountId)
    } else {
      const passId = await storeSecret(
        payload.smtp_pass,
        `smtp_pass_${accountId}`
      )
      await adminClient
        .from('sending_accounts')
        .update({ smtp_pass_id: passId })
        .eq('id', accountId)
    }

    auditLog({
      workspaceId:  member.workspace_id,
      actorId:      user.id,
      action:       'sending_account_added',
      resourceType: 'sending_account',
      resourceId:   accountId,
      metadata:     { type: payload.type, from_email: payload.from_email, name: payload.name },
      request:      req,
    })

    return NextResponse.json({ id: accountId }, { status: 201 })
  } catch (err) {
    console.error('[sending-accounts POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

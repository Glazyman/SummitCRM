/**
 * /unsubscribe?token=<unsubscribeToken>
 *
 * Public unsubscribe page — no auth required.
 * Resolves the token, marks the lead as unsubscribed, and shows a confirmation.
 *
 * CAN-SPAM compliant: processed within 10 business days (we process immediately).
 */

import { Suspense } from 'react'
import { BellOff, CheckCircle2, AlertCircle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveUnsubscribeToken, recordUnsubscribe } from '@/lib/email/suppression'

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

export const metadata = { title: 'Unsubscribe — Summits CRM' }

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { token } = await searchParams

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-muted/30 to-background px-4">
      <div className="w-full max-w-md">
        <Suspense fallback={<UnsubscribeLoading />}>
          <UnsubscribeContent token={token} />
        </Suspense>
      </div>
    </div>
  )
}

async function UnsubscribeContent({ token }: { token?: string }) {
  // ── Validate token ──────────────────────────────────────────────────
  if (!token) {
    return <UnsubscribeError message="This unsubscribe link is invalid or has expired." />
  }

  const adminClient = createAdminClient()
  const resolved    = await resolveUnsubscribeToken(adminClient, token)

  if (!resolved) {
    return <UnsubscribeError message="This unsubscribe link is invalid or has already been used." />
  }

  // ── Process unsubscribe ─────────────────────────────────────────────
  const { success, error } = await recordUnsubscribe(
    adminClient,
    resolved.workspace_id,
    resolved.email,
    token,
  )

  if (!success) {
    return <UnsubscribeError message={`Failed to process unsubscribe: ${error}`} />
  }

  return <UnsubscribeSuccess email={resolved.email} />
}

// ── Success UI ────────────────────────────────────────────────────────────
function UnsubscribeSuccess({ email }: { email: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
        <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
      </div>
      <h1 className="text-xl font-semibold">You've been unsubscribed</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">{email}</strong> has been removed
        from our mailing list. You will no longer receive marketing emails from us.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        If this was a mistake, you can contact us to be re-added.
        Transactional emails related to your account may still be sent.
      </p>
    </div>
  )
}

// ── Error UI ──────────────────────────────────────────────────────────────
function UnsubscribeError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
        <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
      </div>
      <h1 className="text-xl font-semibold">Unsubscribe failed</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <p className="mt-4 text-xs text-muted-foreground">
        If you believe this is an error, please reply to the original email
        with &quot;UNSUBSCRIBE&quot; in the subject line.
      </p>
    </div>
  )
}

// ── Loading UI ────────────────────────────────────────────────────────────
function UnsubscribeLoading() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <BellOff className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold">Processing…</h1>
      <p className="mt-2 text-sm text-muted-foreground">Please wait while we process your request.</p>
    </div>
  )
}

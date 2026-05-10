'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const appOrigin =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      (typeof window !== 'undefined' ? window.location.origin : '')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appOrigin}/auth/callback?next=/reset-password`,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Check your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a password reset link to{' '}
            <span className="font-medium text-foreground">{email}</span>.
            <br />
            The link expires in 1 hour.
          </p>

          <div className="mt-6 space-y-3 w-full">
            <p className="text-xs text-muted-foreground">
              Didn&apos;t receive it? Check your spam folder, or{' '}
              <button
                type="button"
                className="underline underline-offset-4 hover:text-foreground"
                onClick={() => { setSent(false) }}
              >
                try again
              </button>.
            </p>
          </div>

          <Link
            href="/login"
            className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="px-6 pt-6 pb-5">
        <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="px-6 pb-2 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/8 px-3.5 py-3 text-sm text-destructive">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">Email address</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-2 space-y-4">
          <Button type="submit" className="w-full" loading={loading}>
            Send Reset Link <Send className="h-4 w-4" />
          </Button>

          <Link
            href="/login"
            className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </form>
    </div>
  )
}

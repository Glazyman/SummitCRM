'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { WorkspaceRole } from '@/types/database'

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  super_admin: 'Admin',
  admin:       'Admin',
  rep:         'Rep',
}

interface Props {
  token:         string
  email:         string
  role:          string
  workspaceName: string
}

export default function AcceptInviteClient({ token, email, role, workspaceName }: Props) {
  const router = useRouter()
  const [fullName,        setFullName]        = React.useState('')
  const [password,        setPassword]        = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [showPass,        setShowPass]        = React.useState(false)
  const [submitting,      setSubmitting]      = React.useState(false)
  const [error,           setError]           = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!fullName.trim()) {
      setError('Please enter your full name')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/team/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, full_name: fullName.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to accept invitation')
        return
      }
      router.replace('/dashboard')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Join {workspaceName}</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;ve been invited as <strong>{ROLE_LABELS[role as WorkspaceRole] ?? role}</strong>.
            Create your account to get started.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email (read-only) */}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="bg-muted/50"
              />
            </div>

            {/* Full name */}
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                type="text"
                placeholder="Jane Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm_password">Confirm Password</Label>
              <Input
                id="confirm_password"
                type={showPass ? 'text' : 'password'}
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={cn(
                  confirmPassword && confirmPassword !== password
                    ? 'border-destructive focus-visible:ring-destructive'
                    : ''
                )}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create account & join'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <a href="/login" className="text-primary hover:underline">Sign in →</a>
        </p>
      </div>
    </div>
  )
}

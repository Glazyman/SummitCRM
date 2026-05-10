'use client'

import * as React from 'react'
import { Eye, EyeOff, Lock, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: '' }
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw))   score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const capped = Math.min(score, 4)
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  return { score: capped, label: labels[capped] }
}

export function ChangePasswordForm() {
  const [password, setPassword]     = React.useState('')
  const [confirm, setConfirm]       = React.useState('')
  const [showPw, setShowPw]         = React.useState(false)
  const [showConfirm, setShowConfirm] = React.useState(false)
  const [saving, setSaving]         = React.useState(false)
  const [saved, setSaved]           = React.useState(false)
  const [error, setError]           = React.useState<string | null>(null)

  const { score, label } = passwordStrength(password)
  const match = confirm.length > 0 && password === confirm
  const canSubmit = password.length >= 8 && match && !saving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({ password })

    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }

    setSaved(true)
    setPassword('')
    setConfirm('')
    setTimeout(() => setSaved(false), 4000)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base">Change Password</CardTitle>
        </div>
        <CardDescription>Choose a strong, unique password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* New password */}
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Strength bar */}
            {password && (
              <div className="space-y-1 pt-0.5">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((lvl) => (
                    <div
                      key={lvl}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-all',
                        score >= lvl ? 'bg-foreground/30' : 'bg-muted'
                      )}
                    />
                  ))}
                </div>
                {label && (
                  <p className="text-xs text-muted-foreground">{label} password</p>
                )}
              </div>
            )}
          </div>

          {/* Confirm */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
                className={cn(
                  'pr-9',
                  confirm.length > 0 && !match && 'border-destructive focus-visible:ring-destructive'
                )}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirm.length > 0 && !match && (
              <p className="text-xs text-destructive">Passwords don&apos;t match</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!canSubmit} className="gap-1.5">
              {saving ? 'Updating…' : saved ? <><Check className="h-4 w-4" /> Updated</> : 'Update password'}
            </Button>
            {saved && <p className="text-sm text-muted-foreground">Your password has been changed.</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

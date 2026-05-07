import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { User, Mail, KeyRound } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Profile — Summits CRM' }

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fullName = user.user_metadata?.full_name as string | undefined
  const email    = user.email ?? ''

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal account settings.
        </p>
      </div>

      {/* Account info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{fullName ?? 'Your Account'}</CardTitle>
              <CardDescription>{email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Full name
              </label>
              <p className="mt-1 text-sm font-medium">{fullName ?? '—'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Email address
              </label>
              <p className="mt-1 text-sm font-medium flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                {email}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-2 border-t">
            Profile editing coming soon. Contact your workspace admin to update your name or email.
          </p>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Password</CardTitle>
          </div>
          <CardDescription>
            Use a strong, unique password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/forgot-password"
            className="text-sm text-primary hover:underline font-medium"
          >
            Reset password via email →
          </a>
        </CardContent>
      </Card>
    </div>
  )
}

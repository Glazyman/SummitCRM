import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProfileForm } from './profile-form'

export const metadata: Metadata = { title: 'Profile — Settings' }

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fullName = (user.user_metadata?.full_name as string | undefined) ?? ''
  const email    = user.email ?? ''

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Settings
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your personal account settings.</p>
      </div>

      {/* Editable profile form */}
      <ProfileForm initialName={fullName} email={email} />

      {/* Password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Password</CardTitle>
          </div>
          <CardDescription>Use a strong, unique password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/forgot-password"
            className="text-sm text-primary hover:underline font-medium"
          >
            Reset password via email →
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

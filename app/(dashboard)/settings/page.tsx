import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Bell, User, Cpu } from 'lucide-react'

export const metadata: Metadata = { title: 'Settings' }

const ALL_SECTIONS = [
  {
    href:        '/settings/profile',
    icon:        User,
    title:       'Profile',
    description: 'Update your personal information and password.',
    adminOnly:   false,
  },
  {
    href:        '/settings/team',
    icon:        Users,
    title:       'Team Members',
    description: 'Manage team members and their roles.',
    adminOnly:   true,
  },
  {
    href:        '/settings/notifications',
    icon:        Bell,
    title:       'Notifications',
    description: 'Configure your notification preferences.',
    adminOnly:   true,
  },
  {
    href:        '/settings/ai-usage',
    icon:        Cpu,
    title:       'AI Usage',
    description: 'Monitor AI token consumption and set budget limits.',
    adminOnly:   true,
  },
]

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { role: string } | null; error: unknown }

  const isAdmin = ['admin', 'super_admin'].includes(member?.role ?? '')
  const sections = ALL_SECTIONS.filter((s) => !s.adminOnly || isAdmin)

  return (
    <div className="space-y-6">
      <div>
        <h1>Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your account and workspace configuration.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="group block h-full">
            <Card className="h-full cursor-pointer transition-colors group-hover:border-primary/50 group-hover:bg-muted/30">
              <CardHeader className="pb-3">
                <div className="mb-2 w-fit rounded-lg bg-primary/10 p-2">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

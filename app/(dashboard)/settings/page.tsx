import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Send, Bell, User, Cpu } from 'lucide-react'

export const metadata: Metadata = { title: 'Settings' }

const settingsSections = [
  {
    href:        '/settings/profile',
    icon:        User,
    title:       'Profile',
    description: 'Update your personal information and password.',
  },
  {
    href:        '/settings/team',
    icon:        Users,
    title:       'Team Members',
    description: 'Manage team members and their roles.',
  },
  {
    href:        '/settings/sending-accounts',
    icon:        Send,
    title:       'Sending Accounts',
    description: 'Connect Resend API keys and SMTP accounts.',
  },
  {
    href:        '/settings/notifications',
    icon:        Bell,
    title:       'Notifications',
    description: 'Configure your notification preferences.',
  },
  {
    href:        '/settings/ai-usage',
    icon:        Cpu,
    title:       'AI Usage',
    description: 'Monitor AI token consumption and set budget limits.',
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1>Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your workspace configuration.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {settingsSections.map((s) => (
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

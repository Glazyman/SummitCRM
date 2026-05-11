import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { AiUsageClient } from './ai-usage-client'

export const metadata = { title: 'AI Usage — Settings' }

export default async function AiUsagePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single() as { data: { role: string } | null; error: unknown }

  if (!['admin', 'super_admin'].includes(member?.role ?? '')) redirect('/settings')

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-0 py-6">
      <Link href="/settings" className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <div className="mb-6">
        <h1 className="text-xl font-bold">AI Usage</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track cost and tokens consumed by AI snapshot generation. Each Email Snapshot click calls OpenAI gpt-4o.
        </p>
      </div>
      <AiUsageClient />
    </div>
  )
}

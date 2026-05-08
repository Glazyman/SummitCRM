import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AIUsageDashboard } from '@/components/ai'

export const metadata = { title: 'AI Usage — Settings' }

export default function AIUsagePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/settings" className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <AIUsageDashboard />
    </div>
  )
}

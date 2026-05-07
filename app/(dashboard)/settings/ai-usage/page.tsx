import { AIUsageDashboard } from '@/components/ai'

export const metadata = { title: 'AI Usage — Summits CRM' }

export default function AIUsagePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <AIUsageDashboard />
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: {
    default: 'Sign In',
    template: '%s | Summits CRM',
  },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Summits CRM'

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Subtle background decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        {/* Soft neutral panels */}
        <div className="absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-secondary blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-[400px] w-[400px] rounded-full bg-secondary blur-3xl" />
        {/* Dot grid */}
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.03]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="dot-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dot-grid)" />
        </svg>
      </div>

      {/* Brand */}
      <Link href="/" className="mb-8 flex flex-col items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg p-1">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card shadow-card">
          <svg
            className="h-6 w-6 text-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v-2zm0 0a2 2 0 012-2h6l2 2h6a2 2 0 012 2" />
          </svg>
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">
          {appName}
        </span>
      </Link>

      {/* Form card */}
      <div className="w-full max-w-[420px]">
        {children}
      </div>

      {/* Footer */}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} {appName}. All rights reserved.
      </p>
    </div>
  )
}

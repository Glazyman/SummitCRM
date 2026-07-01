import type { Metadata, Viewport } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import { ThemeProvider } from '@/components/layout/theme-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

// Elegant serif for the brand wordmark.
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  weight: ['500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Summits CRM',
    template: '%s | Summits CRM',
  },
  description: 'AI-powered cold outreach CRM for modern sales teams.',
  icons: {
    // "SM" monogram (serif, matching the wordmark). SVG only — the old default
    // favicon.ico was removed so it can't win over this. `?v=2` busts the
    // browser's aggressive favicon cache.
    icon: { url: '/icon.svg?v=2', type: 'image/svg+xml' },
    shortcut: '/icon.svg?v=2',
    apple: '/icon.svg?v=2',
  },
}

// Ensures phones render at device width (not zoomed-out at 980px) and
// scale to 1. Without this the entire mobile layout looks tiny.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Allow pinch-zoom for accessibility; cap to avoid accidental over-zoom.
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${playfair.variable}`}>
      <body className="font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}

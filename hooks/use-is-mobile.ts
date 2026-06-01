'use client'

import { useState, useEffect } from 'react'

/**
 * Returns `true` when the viewport is below the given breakpoint (default
 * `lg` = 1024px, the point where the desktop sidebar is hidden).
 *
 * SSR-safe: returns `false` on the server and on the first client render so
 * the desktop layout never flashes on large screens, then updates after mount.
 * Pages use this to auto-pick a mobile-friendly view (e.g. cards instead of a
 * wide table). Desktop (≥ breakpoint) behaviour is unchanged.
 */
export function useIsMobile(breakpointPx = 1024): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [breakpointPx])

  return isMobile
}

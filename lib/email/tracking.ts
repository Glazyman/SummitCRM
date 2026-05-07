/**
 * lib/email/tracking.ts
 *
 * Email HTML transformations:
 * 1. Sanitizes HTML to prevent XSS (DOMPurify)
 * 2. Injects a 1×1 transparent tracking pixel
 * 3. Wraps all href links through the click-tracking redirect
 * 4. Appends a compliant unsubscribe footer
 *
 * All IDs are random UUID tokens stored in the `emails` table.
 */

import crypto from 'crypto'
import DOMPurify from 'isomorphic-dompurify'

// ── HTML sanitization ─────────────────────────────────────────────────────
/**
 * Sanitize email body HTML to prevent XSS.
 * Allows common email-safe tags and attributes.
 * Call this BEFORE buildSendableHtml and BEFORE storing body_html in DB.
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
      'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4',
      'div', 'span', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img',
    ],
    ALLOWED_ATTR: ['href', 'style', 'class', 'src', 'alt', 'width', 'height', 'target'],
    // Prevent javascript: URLs
    ALLOW_DATA_ATTR: false,
    // Force relative hrefs and data: URIs to be stripped
    FORBID_ATTR:  ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout'],
    FORBID_TAGS:  ['script', 'object', 'embed', 'form', 'input', 'base'],
  })
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.summitscrm.com'

// ── Token generation ──────────────────────────────────────────────────────
export function generateTrackingPixelId(): string {
  return crypto.randomUUID()
}

export function generateUnsubscribeToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// ── Tracking pixel HTML ───────────────────────────────────────────────────
function buildTrackingPixel(pixelId: string): string {
  const url = `${APP_URL}/api/track/open/${encodeURIComponent(pixelId)}`
  return (
    `<img src="${url}" width="1" height="1" ` +
    `style="display:none;width:1px;height:1px;border:0;" alt="" />`
  )
}

// ── Unsubscribe footer ────────────────────────────────────────────────────
function buildUnsubscribeFooter(token: string, fromName: string): string {
  const url = `${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`
  return `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;
            font-size:11px;color:#9ca3af;font-family:sans-serif;line-height:1.6;">
  <p>You are receiving this email because you or your team opted you in for outreach.
  If you no longer wish to receive emails from ${escapeHtml(fromName)},
  <a href="${url}" style="color:#6b7280;text-decoration:underline;">click here to unsubscribe</a>.
  This request will be processed within 2 business days.</p>
</div>`
}

// ── Click-tracking link wrapper ────────────────────────────────────────────
/**
 * Replace every <a href="..."> in the HTML body with a tracking redirect.
 * Skips:
 *   - mailto: links
 *   - tel: links
 *   - the unsubscribe link itself (already absolute)
 *   - links that are already our tracking URLs
 */
export function wrapLinksForTracking(html: string, emailId: string): string {
  // Match href="..." (handles single and double quotes)
  return html.replace(
    /href=["']([^"']+)["']/g,
    (match, rawUrl: string) => {
      if (
        rawUrl.startsWith('mailto:') ||
        rawUrl.startsWith('tel:') ||
        rawUrl.startsWith('#') ||
        rawUrl.includes(`${APP_URL}/api/track/`) ||
        rawUrl.includes(`${APP_URL}/unsubscribe`)
      ) {
        return match   // do not wrap
      }
      const redirectUrl = `${APP_URL}/api/track/click/${encodeURIComponent(emailId)}?url=${encodeURIComponent(rawUrl)}`
      return `href="${redirectUrl}"`
    }
  )
}

// ── Full HTML transformation ───────────────────────────────────────────────
/**
 * Takes raw composed HTML and returns the final sendable HTML with:
 * - click-tracking on all links
 * - tracking pixel appended before </body>
 * - unsubscribe footer appended before </body>
 */
export function buildSendableHtml(params: {
  html:            string
  emailId:         string
  pixelId:         string
  unsubscribeToken:string
  fromName:        string
}): string {
  const { html, emailId, pixelId, unsubscribeToken, fromName } = params

  // Sanitize FIRST — remove any XSS vectors before processing
  let result = sanitizeEmailHtml(html)

  // 1. Wrap links
  result = wrapLinksForTracking(result, emailId)

  // 2. Pixel + footer before </body> (or append at end)
  const pixel  = buildTrackingPixel(pixelId)
  const footer = buildUnsubscribeFooter(unsubscribeToken, fromName)
  const inject = `\n${footer}\n${pixel}\n`

  if (result.includes('</body>')) {
    result = result.replace('</body>', `${inject}</body>`)
  } else {
    result += inject
  }

  return result
}

/**
 * Strip HTML tags and return plain text (used for body_text column).
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Helpers ───────────────────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

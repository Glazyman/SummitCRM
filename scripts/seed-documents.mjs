/**
 * scripts/seed-documents.mjs
 *
 * One-off seeder for the Documents library. Idempotent by document name.
 *
 *   1. Ensures the private 'documents' storage bucket exists.
 *   2. Picks the target workspace (NEXT_PUBLIC_WORKSPACE_ID, else the first
 *      workspace) and an active admin as `uploaded_by`.
 *   3. Uploads each source file to documents/<workspace_id>/<uuid>.<ext> and
 *      inserts a row into public.documents (skips files already present by name).
 *
 * Requires the `documents` table to exist (run the 20260602000001 migration first).
 *
 * Run from the repo root:   node scripts/seed-documents.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'

const FILES = [
  '/Users/glazy/Desktop/SUMMIT LLC.pdf',
  '/Users/glazy/Desktop/Finders Fee Template.pages',
  '/Users/glazy/Desktop/Blue Cardinal Finders Fee.pdf',
  '/Users/glazy/Desktop/Nexcore Signed Finders Fee.docx',
  '/Users/glazy/Desktop/Alpine Finder Agreement.pdf',
]

const MIME = {
  '.pdf':  'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc':  'application/msword',
  '.pages':'application/vnd.apple.pages',
}

function loadEnv() {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  return Object.fromEntries(
    text.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
  )
}

const env = loadEnv()
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── Bucket ──────────────────────────────────────────────────────────────────
const { data: buckets } = await sb.storage.listBuckets()
if (!buckets?.some((b) => b.id === 'documents')) {
  const { error } = await sb.storage.createBucket('documents', { public: false, fileSizeLimit: 26214400 })
  if (error) throw new Error(`createBucket failed: ${error.message}`)
  console.log('• created bucket: documents')
} else {
  console.log('• bucket exists: documents')
}

// ── Workspace + uploader ──────────────────────────────────────────────────────
let workspaceId = env.NEXT_PUBLIC_WORKSPACE_ID || null
if (!workspaceId) {
  const { data } = await sb.from('workspaces').select('id').order('created_at', { ascending: true }).limit(1)
  workspaceId = data?.[0]?.id
}
if (!workspaceId) throw new Error('No workspace found')

const { data: admin } = await sb
  .from('workspace_members')
  .select('user_id')
  .eq('workspace_id', workspaceId)
  .in('role', ['admin', 'super_admin'])
  .eq('is_active', true)
  .limit(1)
const uploadedBy = admin?.[0]?.user_id ?? null
console.log(`• workspace: ${workspaceId}  uploader: ${uploadedBy ?? '(none)'}`)

// ── Existing docs (idempotency by name) ───────────────────────────────────────
const { data: existing } = await sb.from('documents').select('name').eq('workspace_id', workspaceId)
const have = new Set((existing ?? []).map((d) => d.name))

// ── Upload + insert ───────────────────────────────────────────────────────────
for (const path of FILES) {
  const name = basename(path)
  if (have.has(name)) { console.log(`  ↳ skip (exists): ${name}`); continue }

  const ext = extname(path).toLowerCase()
  const bytes = readFileSync(path)
  const filePath = `${workspaceId}/${randomUUID()}${ext}`
  const contentType = MIME[ext] ?? 'application/octet-stream'

  const { error: upErr } = await sb.storage.from('documents').upload(filePath, bytes, { contentType, upsert: false })
  if (upErr) { console.error(`  ✗ upload ${name}: ${upErr.message}`); continue }

  const { error: insErr } = await sb.from('documents').insert({
    workspace_id: workspaceId,
    name,
    file_path: filePath,
    mime_type: contentType,
    size_bytes: bytes.length,
    uploaded_by: uploadedBy,
  })
  if (insErr) {
    await sb.storage.from('documents').remove([filePath])
    console.error(`  ✗ insert ${name}: ${insErr.message}`)
    continue
  }
  console.log(`  ✓ added: ${name} (${(bytes.length / 1024).toFixed(0)} KB)`)
}

console.log('Done.')

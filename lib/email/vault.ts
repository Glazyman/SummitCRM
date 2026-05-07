/**
 * lib/email/vault.ts
 *
 * Secure credential storage using Supabase Vault.
 * API keys and SMTP passwords are NEVER stored in plaintext columns.
 *
 * In production this uses the `vault.create_secret` / `vault.decrypted_secrets`
 * Postgres functions that come with the Supabase Vault extension.
 *
 * For local dev / CI (when Vault is not available), we fall back to
 * AES-256-GCM encryption using the VAULT_ENCRYPTION_KEY env variable
 * — this is good enough for development but should NOT be used in prod
 * without Vault enabled.
 */

import { createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const DEV_KEY = process.env.VAULT_ENCRYPTION_KEY ?? ''
const ALGORITHM = 'aes-256-gcm'

// ── Dev-mode AES-256-GCM fallback ─────────────────────────────────────────
function encryptLocal(plaintext: string): string {
  if (!DEV_KEY) throw new Error('VAULT_ENCRYPTION_KEY not set')
  const key = crypto.createHash('sha256').update(DEV_KEY).digest()
  const iv  = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':')
}

function decryptLocal(ciphertext: string): string {
  if (!DEV_KEY) throw new Error('VAULT_ENCRYPTION_KEY not set')
  const [ivHex, tagHex, encHex] = ciphertext.split(':')
  const key = crypto.createHash('sha256').update(DEV_KEY).digest()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8')
      + decipher.final('utf8')
}

const USE_VAULT = process.env.SUPABASE_VAULT_ENABLED === 'true'

/**
 * Store a secret and return its Vault ID (used as FK reference).
 * In production this calls `vault.create_secret`.
 * In dev it encrypts locally and stores in a temp table via admin client.
 */
export async function storeSecret(
  plaintext:   string,
  secretName:  string,
): Promise<string> {
  if (USE_VAULT) {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('vault_create_secret', {
      secret: plaintext,
      name:   secretName,
    })

    if (error || !data) {
      throw new Error(`Vault store failed: ${JSON.stringify(error)}`)
    }
    return data as string   // returns the vault secret UUID
  }

  // Dev fallback: store in app_secrets table (must exist in migration)
  const supabase = createAdminClient()
  const encrypted = encryptLocal(plaintext)
  const { data, error } = await supabase
    .from('app_secrets')
    .upsert({ name: secretName, ciphertext: encrypted })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Local secret store failed: ${JSON.stringify(error)}`)
  }
  return (data as { id: string }).id
}

/**
 * Retrieve a secret value by its Vault ID.
 * Only callable server-side (admin client).
 */
export async function retrieveSecret(vaultId: string): Promise<string> {
  if (USE_VAULT) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('id', vaultId)
      .single()

    if (error || !data) {
      throw new Error(`Vault retrieve failed: ${JSON.stringify(error)}`)
    }
    return (data as { decrypted_secret: string }).decrypted_secret
  }

  // Dev fallback
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('app_secrets')
    .select('ciphertext')
    .eq('id', vaultId)
    .single()

  if (error || !data) {
    throw new Error(`Local secret retrieve failed: ${JSON.stringify(error)}`)
  }
  return decryptLocal((data as { ciphertext: string }).ciphertext)
}

/**
 * Delete a stored secret (called when a sending account is removed).
 */
export async function deleteSecret(vaultId: string): Promise<void> {
  if (USE_VAULT) {
    const supabase = createAdminClient()
    await supabase.rpc('vault_delete_secret', { secret_id: vaultId })
    return
  }
  const supabase = createAdminClient()
  await supabase.from('app_secrets').delete().eq('id', vaultId)
}

'use client'

import * as React from 'react'
import { Mail, Server, Eye, EyeOff, Key, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { SendingAccountType } from '@/lib/email/types'

interface AddSendingAccountModalProps {
  open:    boolean
  onClose: () => void
  onSaved: () => void
}

type FormState = {
  name:           string
  from_email:     string
  from_name:      string
  daily_limit:    string
  // Resend
  resend_api_key: string
  // SMTP
  smtp_host:      string
  smtp_port:      string
  smtp_user:      string
  smtp_pass:      string
  smtp_secure:    boolean
}

const INITIAL: FormState = {
  name: '', from_email: '', from_name: '', daily_limit: '50',
  resend_api_key: '',
  smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_secure: false,
}

export function AddSendingAccountModal({ open, onClose, onSaved }: AddSendingAccountModalProps) {
  const [type,        setType]        = React.useState<SendingAccountType>('resend')
  const [form,        setForm]        = React.useState<FormState>(INITIAL)
  const [showPass,    setShowPass]    = React.useState(false)
  const [saving,      setSaving]      = React.useState(false)
  const [testing,     setTesting]     = React.useState(false)
  const [testResult,  setTestResult]  = React.useState<{ success: boolean; message: string } | null>(null)
  const [error,       setError]       = React.useState<string | null>(null)
  const [savedId,     setSavedId]     = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setForm(INITIAL); setType('resend'); setError(null)
      setTestResult(null); setSavedId(null)
    }
  }, [open])

  function set(k: keyof FormState, v: string | boolean) {
    setForm((f) => ({ ...f, [k]: v }))
    setError(null)
    setTestResult(null)
  }

  // ── Validate ─────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!form.name.trim())       return 'Account name is required.'
    if (!form.from_email.trim()) return 'From email is required.'
    if (!form.from_name.trim())  return 'From name is required.'
    if (type === 'resend') {
      if (!form.resend_api_key.startsWith('re_')) return 'Resend API key must start with "re_".'
    } else {
      if (!form.smtp_host.trim()) return 'SMTP host is required.'
      if (!form.smtp_user.trim()) return 'SMTP username is required.'
      if (!form.smtp_pass.trim()) return 'SMTP password is required.'
    }
    return null
  }

  // ── Save ──────────────────────────────────────────────────────────────
  async function handleSave() {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setSaving(true); setError(null)
    try {
      const payload: Record<string, unknown> = {
        type,
        name:        form.name.trim(),
        from_email:  form.from_email.trim(),
        from_name:   form.from_name.trim(),
        daily_limit: parseInt(form.daily_limit) || 50,
      }
      if (type === 'resend') {
        payload.resend_api_key = form.resend_api_key.trim()
      } else {
        payload.smtp_host   = form.smtp_host.trim()
        payload.smtp_port   = parseInt(form.smtp_port) || 587
        payload.smtp_user   = form.smtp_user.trim()
        payload.smtp_pass   = form.smtp_pass
        payload.smtp_secure = form.smtp_secure
      }

      const res  = await fetch('/api/sending-accounts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to save.'); return }

      setSavedId(data.id)
      onSaved()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  // ── Test ──────────────────────────────────────────────────────────────
  async function handleTest() {
    if (!savedId) { setError('Save the account first before testing.'); return }
    setTesting(true); setTestResult(null)
    try {
      const res  = await fetch(`/api/sending-accounts/${savedId}/test`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      })
      const data = await res.json()
      setTestResult({
        success: res.ok,
        message: res.ok ? 'Test email sent successfully!' : (data.error ?? 'Test failed'),
      })
    } catch (err) {
      setTestResult({ success: false, message: String(err) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Add Sending Account
          </DialogTitle>
          <DialogDescription>
            Connect a Resend API account or an SMTP server. Credentials are encrypted and never stored in plain text.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 pb-2">

          {/* ── Type toggle ── */}
          <div className="flex rounded-xl border border-border overflow-hidden">
            {(['resend', 'smtp'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setError(null) }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
                  type === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {t === 'resend'
                  ? <><Key className="h-3.5 w-3.5" /> Resend API</>
                  : <><Server className="h-3.5 w-3.5" /> SMTP Server</>
                }
              </button>
            ))}
          </div>

          {/* ── Common fields ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Account name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Sales Outreach"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Daily send limit</Label>
              <Input
                type="number"
                min={1} max={500}
                value={form.daily_limit}
                onChange={(e) => set('daily_limit', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>From email <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                value={form.from_email}
                onChange={(e) => set('from_email', e.target.value)}
                placeholder="outreach@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>From name <span className="text-destructive">*</span></Label>
              <Input
                value={form.from_name}
                onChange={(e) => set('from_name', e.target.value)}
                placeholder="John Smith"
              />
            </div>
          </div>

          {/* ── Resend-specific ── */}
          {type === 'resend' && (
            <div className="space-y-1.5">
              <Label>Resend API Key <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input
                  type={showPass ? 'text' : 'password'}
                  value={form.resend_api_key}
                  onChange={(e) => set('resend_api_key', e.target.value)}
                  placeholder="re_xxxxxxxxxxxxxxxx"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Generate an API key at{' '}
                <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  resend.com/api-keys
                </a>.
                It will be encrypted immediately.
              </p>
            </div>
          )}

          {/* ── SMTP-specific ── */}
          {type === 'smtp' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>SMTP Host <span className="text-destructive">*</span></Label>
                  <Input
                    value={form.smtp_host}
                    onChange={(e) => set('smtp_host', e.target.value)}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={form.smtp_port}
                    onChange={(e) => set('smtp_port', e.target.value)}
                    placeholder="587"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Username <span className="text-destructive">*</span></Label>
                  <Input
                    value={form.smtp_user}
                    onChange={(e) => set('smtp_user', e.target.value)}
                    placeholder="user@domain.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Password <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      type={showPass ? 'text' : 'password'}
                      value={form.smtp_pass}
                      onChange={(e) => set('smtp_pass', e.target.value)}
                      placeholder="App password"
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5">
                <div
                  onClick={() => set('smtp_secure', !form.smtp_secure)}
                  className={cn(
                    'relative h-5 w-9 rounded-full transition-colors',
                    form.smtp_secure ? 'bg-primary' : 'bg-muted-foreground/30'
                  )}
                >
                  <div className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                    form.smtp_secure ? 'translate-x-4' : 'translate-x-0.5'
                  )} />
                </div>
                <span className="text-sm">
                  Use TLS (port 465) instead of STARTTLS
                </span>
              </label>
            </div>
          )}

          {/* ── Error / test result ── */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {testResult && (
            <div className={cn(
              'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm',
              testResult.success
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-400'
                : 'border-destructive/30 bg-destructive/5 text-destructive'
            )}>
              {testResult.success
                ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              {testResult.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            {/* Test button (only after saving) */}
            {savedId ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleTest}
                disabled={testing}
              >
                {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {testing ? 'Testing…' : 'Send Test Email'}
              </Button>
            ) : (
              <span />
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !!savedId}
                className="gap-1.5"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {savedId ? <><CheckCircle2 className="h-3.5 w-3.5" /> Saved</> : saving ? 'Saving…' : 'Save Account'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

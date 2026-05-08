'use client'

import * as React from 'react'
import { User, Mail, Building2, Phone, Globe, Tag, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import type { LeadRow } from './types'

interface BatchOption { id: string; name: string }

interface CreateLeadModalProps {
  open:     boolean
  batches:  BatchOption[]
  onClose:  () => void
  onCreate: (data: NewLeadData) => Promise<void>
}

export interface NewLeadData {
  first_name: string
  last_name:  string
  email:      string
  phone:      string
  company:    string
  title:      string
  website:    string
  batch_id:   string
}

const EMPTY: NewLeadData = {
  first_name: '', last_name: '', email: '',
  phone: '', company: '', title: '', website: '', batch_id: '',
}

/**
 * Modal form for creating a single lead manually.
 * Validates that email is provided before submitting.
 */
export function CreateLeadModal({ open, batches, onClose, onCreate }: CreateLeadModalProps) {
  const [form, setForm]       = React.useState<NewLeadData>(EMPTY)
  const [loading, setLoading] = React.useState(false)
  const [error, setError]     = React.useState<string | null>(null)
  const emailRef              = React.useRef<HTMLInputElement>(null)

  // Reset form when opened
  React.useEffect(() => {
    if (open) {
      setForm(EMPTY)
      setError(null)
      setTimeout(() => emailRef.current?.focus(), 50)
    }
  }, [open])

  function patch(key: keyof NewLeadData, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email.trim()) {
      setError('Email address is required.')
      emailRef.current?.focus()
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address.')
      emailRef.current?.focus()
      return
    }
    try {
      setLoading(true)
      setError(null)
      await onCreate(form)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            Add New Lead
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 py-2">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="First Name"
                icon={<User className="h-3.5 w-3.5" />}
              >
                <Input
                  placeholder="First name"
                  value={form.first_name}
                  onChange={(e) => patch('first_name', e.target.value)}
                  autoComplete="given-name"
                />
              </FormField>
              <FormField label="Last Name">
                <Input
                  placeholder="Harrington"
                  value={form.last_name}
                  onChange={(e) => patch('last_name', e.target.value)}
                  autoComplete="family-name"
                />
              </FormField>
            </div>

            {/* Email */}
            <FormField
              label="Email"
              required
              icon={<Mail className="h-3.5 w-3.5" />}
            >
              <Input
                ref={emailRef}
                type="email"
                placeholder="email@company.com"
                value={form.email}
                onChange={(e) => patch('email', e.target.value)}
                autoComplete="email"
                className={cn(error && 'border-destructive focus:ring-destructive')}
              />
            </FormField>

            {/* Company + Title */}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Company" icon={<Building2 className="h-3.5 w-3.5" />}>
                <Input
                  placeholder="Company name"
                  value={form.company}
                  onChange={(e) => patch('company', e.target.value)}
                />
              </FormField>
              <FormField label="Job Title" icon={<Briefcase className="h-3.5 w-3.5" />}>
                <Input
                  placeholder="CEO"
                  value={form.title}
                  onChange={(e) => patch('title', e.target.value)}
                />
              </FormField>
            </div>

            {/* Phone + Website */}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Phone" icon={<Phone className="h-3.5 w-3.5" />}>
                <Input
                  type="tel"
                  placeholder="+1 415 555 0100"
                  value={form.phone}
                  onChange={(e) => patch('phone', e.target.value)}
                />
              </FormField>
              <FormField label="Website" icon={<Globe className="h-3.5 w-3.5" />}>
                <Input
                  type="url"
                  placeholder="https://acme.com"
                  value={form.website}
                  onChange={(e) => patch('website', e.target.value)}
                />
              </FormField>
            </div>

            {/* Batch selector */}
            {batches.length > 0 && (
              <FormField label="Add to Batch" icon={<Tag className="h-3.5 w-3.5" />}>
                <select
                  value={form.batch_id}
                  onChange={(e) => patch('batch_id', e.target.value)}
                  className={cn(
                    'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0'
                  )}
                >
                  <option value="">No batch</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </FormField>
            )}

            {/* Error */}
            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="min-w-[100px]">
              {loading ? <Spinner size="sm" /> : 'Add Lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Form field wrapper ─────────────────────────────────────────────────────
function FormField({
  label,
  children,
  required,
  icon,
}: {
  label:    string
  children: React.ReactNode
  required?: boolean
  icon?:    React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  )
}

'use client'

import * as React from 'react'
import { User, Mail, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function ProfileForm({ initialName, email }: { initialName: string; email: string }) {
  const [name, setName]       = React.useState(initialName)
  const [saving, setSaving]   = React.useState(false)
  const [saved, setSaved]     = React.useState(false)
  const [error, setError]     = React.useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({
      data: { full_name: name.trim() },
    })

    if (err) {
      setError(err.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base">Account Info</CardTitle>
        </div>
        <CardDescription>Update your display name.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Email address</Label>
            <div className="flex items-center gap-2 h-10 rounded-lg border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {email}
            </div>
            <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving || !name.trim()} className="gap-1.5">
              {saving ? 'Saving…' : saved ? <><Check className="h-4 w-4" /> Saved</> : 'Save changes'}
            </Button>
            {saved && <p className="text-sm text-muted-foreground">Your profile has been updated.</p>}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WorkspaceRole } from '@/types/database'

interface WorkspaceMemberState {
  workspaceId: string | null
  role: WorkspaceRole | null
  workspaceName: string | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Returns the current user's workspace membership and role.
 * Used by RoleGate and navigation components.
 */
export function useWorkspace(): WorkspaceMemberState {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [role, setRole] = useState<WorkspaceRole | null>(null)
  const [workspaceName, setWorkspaceName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchMembership = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data, error: memberError } = await supabase
        .from('workspace_members')
        .select('workspace_id, role, workspaces(name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single() as {
          data: { workspace_id: string; role: WorkspaceRole; workspaces: { name: string } | null } | null
          error: unknown
        }

      if (memberError || !data) {
        setError('No workspace membership found')
        setLoading(false)
        return
      }

      setWorkspaceId(data.workspace_id)
      setRole(data.role)
      setWorkspaceName(data.workspaces?.name ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchMembership()
  }, [fetchMembership])

  return { workspaceId, role, workspaceName, loading, error, refetch: fetchMembership }
}

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 003: Core Tables
-- Workspaces, membership, and invitations.
-- These are the foundation every other table depends on.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── workspaces ────────────────────────────────────────────────────────────
-- One workspace per organisation (multi-tenancy root).
CREATE TABLE workspaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL                 CHECK (char_length(name) BETWEEN 1 AND 100),
  slug          text NOT NULL UNIQUE          CHECK (slug ~ '^[a-z0-9-]+$' AND char_length(slug) BETWEEN 2 AND 60),
  -- Flexible workspace config: AI budgets, branding, timezone, etc.
  settings      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE workspaces IS 'Top-level multi-tenancy unit. All user data belongs to exactly one workspace.';
COMMENT ON COLUMN workspaces.slug IS 'URL-safe identifier. Used in vanity URLs and dedup checks.';
COMMENT ON COLUMN workspaces.settings IS 'Free-form JSON config: ai_monthly_token_budget, timezone, logo_url, etc.';

-- ── workspace_members ─────────────────────────────────────────────────────
-- Join table between auth.users and workspaces with role assignment.
CREATE TABLE workspace_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          workspace_role NOT NULL DEFAULT 'rep',
  invited_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at     timestamptz,                           -- NULL until they accept
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

COMMENT ON TABLE workspace_members IS 'Grants a user membership and a role within a workspace.';
COMMENT ON COLUMN workspace_members.is_active IS 'Set false to deactivate without deleting history.';

CREATE INDEX idx_workspace_members_workspace ON workspace_members (workspace_id);
CREATE INDEX idx_workspace_members_user      ON workspace_members (user_id);
-- Fast lookup for active members only (most common query path)
CREATE INDEX idx_workspace_members_active    ON workspace_members (workspace_id, user_id)
  WHERE is_active = true;

-- ── invitations ───────────────────────────────────────────────────────────
-- Pending email invitations before user account exists.
CREATE TABLE invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         text NOT NULL                 CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  role          workspace_role NOT NULL DEFAULT 'rep',
  token         text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  invited_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at   timestamptz,
  expires_at    timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Prevent duplicate pending invitations for the same email in a workspace
  UNIQUE (workspace_id, email)
);

COMMENT ON TABLE invitations IS 'Pre-signup invitations. Token is emailed; accepting creates workspace_members row.';
COMMENT ON COLUMN invitations.token IS 'Single-use secret in invite URL. Never log or expose in APIs.';

CREATE INDEX idx_invitations_token     ON invitations (token);
CREATE INDEX idx_invitations_workspace ON invitations (workspace_id);
CREATE INDEX idx_invitations_email     ON invitations (email);
-- Index for finding pending (not yet accepted, not expired) invitations
CREATE INDEX idx_invitations_pending   ON invitations (workspace_id, accepted_at, expires_at)
  WHERE accepted_at IS NULL;

# 02 — Authentication & Roles

## Goal
Implement secure authentication via Supabase Auth, enforce role-based access control, and isolate workspace data at the database layer using Row Level Security.

---

## Features

- Email/password signup and login
- Magic link login
- Workspace creation on first signup
- Team member invitation flow (email invite → accept → join workspace)
- Five roles with granular permissions
- RLS policies on all tables enforce workspace isolation and role restrictions
- Session-based auth via httpOnly Supabase cookies
- Middleware-enforced route protection

---

## Roles & Permissions Matrix

| Permission | super_admin | admin | manager | rep | viewer |
|---|---|---|---|---|---|
| Manage workspace settings | ✓ | ✓ | — | — | — |
| Invite / remove team members | ✓ | ✓ | — | — | — |
| Manage sending accounts | ✓ | ✓ | — | — | — |
| View all leads | ✓ | ✓ | ✓ | own only | own only |
| Create / import leads | ✓ | ✓ | ✓ | ✓ | — |
| Edit lead status | ✓ | ✓ | ✓ | ✓ | — |
| Delete leads | ✓ | ✓ | ✓ | — | — |
| Send individual emails | ✓ | ✓ | ✓ | ✓ | — |
| Create campaigns | ✓ | ✓ | ✓ | — | — |
| View campaigns | ✓ | ✓ | ✓ | own only | ✓ |
| Use AI features | ✓ | ✓ | ✓ | ✓ | — |
| View analytics | ✓ | ✓ | ✓ | own only | own only |
| View admin dashboard | ✓ | ✓ | — | — | — |
| View audit log | ✓ | ✓ | — | — | — |
| Manage roles | ✓ | ✓ | — | — | — |

---

## Database Tables

### `workspaces`
```sql
CREATE TABLE workspaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
```

### `workspace_members`
```sql
CREATE TYPE workspace_role AS ENUM (
  'super_admin', 'admin', 'manager', 'rep', 'viewer'
);

CREATE TABLE workspace_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          workspace_role NOT NULL DEFAULT 'rep',
  invited_by    uuid REFERENCES auth.users(id),
  invited_at    timestamptz,
  joined_at     timestamptz,
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
```

### `invitations`
```sql
CREATE TABLE invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         text NOT NULL,
  role          workspace_role NOT NULL DEFAULT 'rep',
  token         text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  invited_by    uuid NOT NULL REFERENCES auth.users(id),
  accepted_at   timestamptz,
  expires_at    timestamptz DEFAULT (now() + interval '7 days'),
  created_at    timestamptz DEFAULT now()
);
```

---

## RLS Policies

### General Pattern

Every table that holds workspace-scoped data uses:
```sql
-- Read: members of the workspace can read
CREATE POLICY "workspace_members_read" ON <table>
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Write: gated by role
CREATE POLICY "workspace_admins_write" ON <table>
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin', 'manager')
        AND is_active = true
    )
  );
```

### `workspaces` RLS
```sql
-- Users can only see workspaces they belong to
CREATE POLICY "select_own_workspace" ON workspaces
  FOR SELECT USING (
    id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
```

### `workspace_members` RLS
```sql
-- Members can see other members in their workspace
CREATE POLICY "select_workspace_members" ON workspace_members
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members wm2
      WHERE wm2.user_id = auth.uid() AND wm2.is_active = true
    )
  );

-- Only admin/super_admin can modify members
CREATE POLICY "admin_manage_members" ON workspace_members
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
        AND is_active = true
    )
  );
```

---

## Helper Function

```sql
-- Returns current user's role in a workspace
CREATE OR REPLACE FUNCTION get_my_role(ws_id uuid)
RETURNS workspace_role AS $$
  SELECT role FROM workspace_members
  WHERE workspace_id = ws_id AND user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

---

## API Routes

| Method | Path | Description | Required Role |
|---|---|---|---|
| POST | `/api/auth/signup` | Create account + workspace | — |
| POST | `/api/auth/invite` | Send invitation email | admin+ |
| POST | `/api/auth/accept-invite` | Accept invite token | — |
| GET | `/api/team` | List workspace members | admin+ |
| PATCH | `/api/team/[id]` | Update member role | admin+ |
| DELETE | `/api/team/[id]` | Deactivate member | admin+ |

---

## UI Components

- `<LoginForm>` — email/password + magic link tab
- `<SignupForm>` — account creation + workspace name
- `<InviteModal>` — email input + role selector
- `<TeamTable>` — list members, inline role editor, deactivate button
- `<AcceptInvitePage>` — landing page for invite token URL
- `<RoleGate>` — wrapper component: `<RoleGate require="admin">...</RoleGate>`

### `<RoleGate>` Implementation Pattern
```tsx
// Reads role from user context, hides children if insufficient
export function RoleGate({ require, children }) {
  const { role } = useWorkspaceMember();
  const ROLE_RANK = { viewer: 0, rep: 1, manager: 2, admin: 3, super_admin: 4 };
  if (ROLE_RANK[role] < ROLE_RANK[require]) return null;
  return <>{children}</>;
}
```

---

## Implementation Order

1. Create `workspaces`, `workspace_members`, `invitations` tables with migrations
2. Apply RLS policies and helper functions
3. Build Supabase client helpers (`lib/supabase/server.ts`, `lib/supabase/browser.ts`)
4. Implement middleware (`middleware.ts`) for route protection
5. Build login / signup pages
6. Implement workspace creation on first signup (via API route + DB trigger)
7. Build invitation system (send email via Resend, accept token flow)
8. Build team management page
9. Implement `<RoleGate>` component and `useWorkspaceMember` hook
10. Add role checks to all subsequent API routes

---

## Custom Auth Claims (JWT)

Store `workspace_id` and `role` in JWT custom claims via a Supabase Auth hook to avoid extra DB queries on each request:

```sql
-- Supabase Auth Hook: custom_access_token
CREATE OR REPLACE FUNCTION add_claims_to_token(event jsonb)
RETURNS jsonb AS $$
DECLARE
  member_record workspace_members%ROWTYPE;
BEGIN
  SELECT * INTO member_record
  FROM workspace_members
  WHERE user_id = (event->>'user_id')::uuid
    AND is_active = true
  LIMIT 1;

  IF FOUND THEN
    event := jsonb_set(event, '{claims,workspace_id}',
      to_jsonb(member_record.workspace_id::text));
    event := jsonb_set(event, '{claims,role}',
      to_jsonb(member_record.role::text));
  END IF;

  RETURN event;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Testing Checklist

- [ ] User can sign up and workspace is auto-created
- [ ] User can log in with email/password
- [ ] User can log in with magic link
- [ ] Admin can invite a new member by email
- [ ] Invited user receives email and can accept invite
- [ ] Accepted member joins workspace with correct role
- [ ] RLS: user cannot read data from another workspace
- [ ] RLS: viewer cannot mutate leads
- [ ] RLS: rep cannot create campaigns
- [ ] `<RoleGate>` hides UI elements for insufficient roles
- [ ] Deactivated member cannot log in to workspace
- [ ] Expired invitations are rejected

---

## AI Model Guidance

- **No AI needed** for this module. Auth and roles are deterministic logic.
- Use Claude Sonnet only if generating complex RLS policy SQL from requirements.

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 20260611000002: Call Mode session logging
-- One row per Call Mode session: who ran it, the queue preset/batch, how big
-- the queue was, how many calls were logged/skipped, the outcome breakdown,
-- and start/end timestamps. Individual calls still live in call_logs; this is
-- the per-session rollup for rep history + admin oversight.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.call_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id)    ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  queue_preset  text,                                       -- 'fresh' | 'retry' | 'all'
  batch_id      uuid REFERENCES lead_batches(id)            ON DELETE SET NULL,
  queue_size    int  NOT NULL DEFAULT 0,                    -- leads in the queue at start
  calls_logged  int  NOT NULL DEFAULT 0,
  skipped       int  NOT NULL DEFAULT 0,
  outcomes      jsonb NOT NULL DEFAULT '{}'::jsonb,         -- {answered: n, voicemail: n, ...}
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,                                -- NULL = still in progress / abandoned
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.call_sessions IS 'Per-session rollup of a Call Mode power-dialer run. Individual calls live in call_logs.';

CREATE INDEX IF NOT EXISTS idx_call_sessions_workspace ON public.call_sessions (workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_user      ON public.call_sessions (user_id, started_at DESC);

-- Keep updated_at fresh on UPDATE (shared trigger fn).
DROP TRIGGER IF EXISTS set_call_sessions_updated_at ON public.call_sessions;
CREATE TRIGGER set_call_sessions_updated_at
  BEFORE UPDATE ON public.call_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

-- Reps see/own their sessions; admins see all in the workspace. (API routes use
-- the service role + in-route role gating; these policies are defense-in-depth.)
DROP POLICY IF EXISTS "call_sessions_select" ON public.call_sessions;
CREATE POLICY "call_sessions_select"
  ON public.call_sessions FOR SELECT
  USING (user_id = auth.uid() OR is_admin(workspace_id));

DROP POLICY IF EXISTS "call_sessions_insert" ON public.call_sessions;
CREATE POLICY "call_sessions_insert"
  ON public.call_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "call_sessions_update" ON public.call_sessions;
CREATE POLICY "call_sessions_update"
  ON public.call_sessions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

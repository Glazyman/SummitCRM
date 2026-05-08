-- Timeline entries can be removed by authorized users (API route).
-- The original trigger blocked all DELETEs, so UI "delete" never persisted.

DROP TRIGGER IF EXISTS trg_activity_logs_immutable ON activity_logs;

CREATE OR REPLACE FUNCTION deny_activity_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'activity_logs cannot be updated (append-only log).';
END;
$$;

CREATE TRIGGER trg_activity_logs_immutable
  BEFORE UPDATE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION deny_activity_log_mutation();

COMMENT ON TABLE activity_logs IS 'Event log for CRM actions. Rows can be deleted (e.g. mistaken timeline entries); updates remain blocked.';

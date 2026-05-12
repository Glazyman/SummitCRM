-- Notes can be assigned to a specific workspace member — like a quick
-- mention. The recipient gets a notification (type='mention') and can
-- mark it read / dismiss in the bell panel.
--
-- Authorization rule (enforced in the API layer, not here): a rep can
-- only assign a note to an admin/super_admin. Admins can assign to
-- anyone in the workspace.

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Look up "notes assigned to me" — small index, NULL rows excluded.
CREATE INDEX IF NOT EXISTS idx_notes_assigned
  ON public.notes (assigned_to, created_at DESC)
  WHERE assigned_to IS NOT NULL AND deleted_at IS NULL;

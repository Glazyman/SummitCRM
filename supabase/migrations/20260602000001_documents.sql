-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 20260602000001: Documents
-- - Admin-only document library (contracts, templates, signed agreements)
-- - Files live in the private 'documents' storage bucket
-- - Metadata row per file in public.documents
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  file_path     text NOT NULL,                              -- path within the 'documents' bucket: <workspace_id>/<uuid>.<ext>
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.documents IS 'Admin-only document library. One row per stored file; bytes live in the private documents storage bucket.';

CREATE INDEX IF NOT EXISTS idx_documents_workspace ON public.documents (workspace_id, created_at DESC);

-- Keep updated_at fresh on UPDATE (shared trigger fn).
DROP TRIGGER IF EXISTS set_documents_updated_at ON public.documents;
CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Admin+ only — the documents page is an admin feature. Reps/viewers have no
-- access. (Server routes also gate on role, defense-in-depth.)
DROP POLICY IF EXISTS "documents_admin_all" ON public.documents;
CREATE POLICY "documents_admin_all"
  ON public.documents FOR ALL
  USING (is_admin(workspace_id))
  WITH CHECK (is_admin(workspace_id));

-- ── Storage bucket ─────────────────────────────────────────────────────────
-- Private bucket; 25 MB per-file cap; any mime type (PDF, .docx, .pages, …).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documents', 'documents', false, 26214400)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — admin+ of the workspace named by the first path segment.
-- Path convention: <workspace_id>/<file>. All real access goes through the
-- service-role server routes (signed URLs); these are belt-and-suspenders.
CREATE POLICY IF NOT EXISTS "documents_bucket_admin_all"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'documents'
    AND is_admin(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND is_admin(((storage.foldername(name))[1])::uuid)
  );

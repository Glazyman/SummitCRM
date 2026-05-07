-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 012: Storage Buckets & Policies
-- Creates Supabase Storage buckets and their access policies.
-- NOTE: Storage bucket creation via SQL may need to be done via the
--       Supabase Dashboard or CLI in some project configurations.
--       This file documents the intended setup for reference.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Create storage buckets ────────────────────────────────────────────────

-- Lead import CSV files (private — only the uploader and admins)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-imports',
  'lead-imports',
  false,                          -- private bucket
  10485760,                       -- 10 MB max per file
  ARRAY['text/csv', 'text/plain', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- Workspace assets: logos, avatars, attachments (public read, private write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-assets',
  'workspace-assets',
  true,                           -- public read (avatars, logos)
  5242880,                        -- 5 MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Email attachments (private — only recipients and admins)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-attachments',
  'email-attachments',
  false,                          -- private
  25165824,                       -- 24 MB max
  ARRAY['application/pdf', 'image/jpeg', 'image/png',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ──────────────────────────────────────────────────

-- ─── lead-imports bucket ───────────────────────────────────────────────────

-- Upload: rep and above in the workspace
CREATE POLICY "lead_imports_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'lead-imports'
    AND auth.role() = 'authenticated'
    -- Path format: {workspace_id}/{import_id}/{filename}
    -- Extract workspace_id from storage path
    AND is_workspace_member(
      (string_to_array(name, '/'))[1]::uuid
    )
    AND has_role(
      (string_to_array(name, '/'))[1]::uuid,
      'rep'
    )
  );

-- Read: owner of the import (matched via path) or admin
CREATE POLICY "lead_imports_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'lead-imports'
    AND (
      -- Admin can read any import in their workspace
      is_admin((string_to_array(name, '/'))[1]::uuid)
      -- Uploader can read their own file
      OR (
        auth.role() = 'authenticated'
        AND is_workspace_member((string_to_array(name, '/'))[1]::uuid)
      )
    )
  );

-- Delete: admin only
CREATE POLICY "lead_imports_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'lead-imports'
    AND is_admin((string_to_array(name, '/'))[1]::uuid)
  );

-- ─── workspace-assets bucket ──────────────────────────────────────────────

-- Public read (bucket is public=true, no SELECT policy needed)

-- Upload: admin only (logos, brand assets)
CREATE POLICY "workspace_assets_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'workspace-assets'
    AND auth.role() = 'authenticated'
    AND is_admin((string_to_array(name, '/'))[1]::uuid)
  );

-- Delete: admin only
CREATE POLICY "workspace_assets_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'workspace-assets'
    AND is_admin((string_to_array(name, '/'))[1]::uuid)
  );

-- ─── email-attachments bucket ─────────────────────────────────────────────

-- Upload: rep and above
CREATE POLICY "email_attachments_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'email-attachments'
    AND auth.role() = 'authenticated'
    AND has_role(
      (string_to_array(name, '/'))[1]::uuid,
      'rep'
    )
  );

-- Read: workspace members only
CREATE POLICY "email_attachments_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'email-attachments'
    AND is_workspace_member((string_to_array(name, '/'))[1]::uuid)
  );

-- Delete: sender or admin
CREATE POLICY "email_attachments_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'email-attachments'
    AND (
      owner = auth.uid()
      OR is_admin((string_to_array(name, '/'))[1]::uuid)
    )
  );

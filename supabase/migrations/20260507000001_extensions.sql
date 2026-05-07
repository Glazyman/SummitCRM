-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 001: Extensions
-- Enable all required Postgres extensions.
-- ═══════════════════════════════════════════════════════════════════════════

-- UUID generation (gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg_cron for scheduled jobs (reset quotas, digests, follow-up checks)
-- NOTE: pg_cron must also be enabled in Supabase dashboard under
--       Database → Extensions → pg_cron
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- HTTP calls from Postgres (used by pg_cron to trigger Edge Functions)
-- NOTE: pg_net must also be enabled in Supabase dashboard
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- Full-text search (used for lead search)
-- Built-in, no CREATE EXTENSION needed but we document it here.
-- tsvector / tsquery patterns used in leads search index.

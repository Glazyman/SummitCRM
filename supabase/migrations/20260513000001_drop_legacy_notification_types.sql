-- §18 #5 + #6 from HANDOFF-2026-05-12-pm.md
--
-- The notification_type enum has been carrying six dormant values from
-- the email era: reply_received, bounce, campaign_complete, quota_warning,
-- task_reminder, unsubscribe. The product only emits three types today:
-- mention, follow_up_due, lead_assigned. This migration:
--
--   1. Deletes any inert rows in notifications + notification_preferences
--      that reference legacy types (so the column cast below can't fail).
--   2. Creates a fresh enum with only the active values.
--   3. Swaps both columns to the new enum.
--   4. Drops the old enum, renames the new one back.
--
-- Postgres has no `ALTER TYPE ... DROP VALUE` — the swap dance is the
-- canonical workaround.

BEGIN;

-- ── Step 1: Drop inert rows that would block the column cast ───────────
DELETE FROM notifications
WHERE type::text NOT IN ('mention', 'follow_up_due', 'lead_assigned');

DELETE FROM notification_preferences
WHERE type::text NOT IN ('mention', 'follow_up_due', 'lead_assigned');

-- ── Step 2: New enum, active values only ──────────────────────────────
CREATE TYPE notification_type_new AS ENUM (
  'mention',
  'follow_up_due',
  'lead_assigned'
);

-- ── Step 3: Swap columns ──────────────────────────────────────────────
ALTER TABLE notifications
  ALTER COLUMN type TYPE notification_type_new
  USING type::text::notification_type_new;

ALTER TABLE notification_preferences
  ALTER COLUMN type TYPE notification_type_new
  USING type::text::notification_type_new;

-- ── Step 4: Drop the old type, rename the new one ─────────────────────
DROP TYPE notification_type;
ALTER TYPE notification_type_new RENAME TO notification_type;

COMMIT;

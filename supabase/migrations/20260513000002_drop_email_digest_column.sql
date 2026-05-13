-- §18 #8 from HANDOFF-2026-05-12-pm.md
--
-- notification_preferences.email_digest was a half-built feature from
-- the email era. The settings UI used to render a toggle for it, but
-- no cron exists to actually send daily digest emails — the column was
-- writable but never read. Last session the UI was stripped of the
-- column (commit 6687204) but the schema column was left in place.
--
-- Dropping it closes the loop.

ALTER TABLE notification_preferences DROP COLUMN email_digest;

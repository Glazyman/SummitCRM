-- PATCH /api/leads/[id] has always logged interest changes as
-- 'interest_status_changed', but that value was never added to the
-- activity_type enum. The batched activity_logs insert was rejected whole
-- (unchecked), so no interest change was ever recorded — and any other log
-- row in the same PATCH (status change, assignment) was dropped with it.
-- Needed by the Leads "Marked interested" card and the per-rep
-- "Marked Interested" counts on Dashboard + Analytics.
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'interest_status_changed';

-- Make notification inserts push to the browser in real time.
-- Without this, the rep's bell only updates when the page is reloaded
-- or the next polled fetch fires — so an admin's freshly-assigned note
-- looked like it never arrived.
--
-- The browser-side channel in notification-context already subscribes:
--   .on('postgres_changes', { event: 'INSERT', table: 'notifications',
--                              filter: `user_id=eq.${userId}` }, ...)
-- but the table has to be in the publication for those events to flow.

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

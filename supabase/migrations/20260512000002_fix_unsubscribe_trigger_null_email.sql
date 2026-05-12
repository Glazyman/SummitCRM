-- Fix: sync_lead_unsubscribe was failing on leads with NULL email.
--
-- The trigger inserts into unsubscribes(workspace_id, email, lead_id, source)
-- when a lead's status flips to 'do_not_contact' / 'unsubscribed'. unsubscribes.email
-- is NOT NULL, so for any lead with email IS NULL the INSERT raised a constraint
-- violation, the BEFORE-UPDATE aborted, and the PATCH /api/leads/:id call returned
-- 400. The frontend's optimistic update then rolled back — visible as "click Bad
-- Lead, status flashes then reverts to New" on roughly 38% of the leads list.
--
-- Fix: skip the unsubscribes insert when email is NULL. There is no address to
-- track for unsubscribe purposes. Still flip is_unsubscribed / unsubscribed_at on
-- the lead row so the rest of the app treats the lead as opted out.

CREATE OR REPLACE FUNCTION public.sync_lead_unsubscribe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('unsubscribed','do_not_contact')
     AND (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.is_unsubscribed IS DISTINCT FROM NEW.is_unsubscribed)
  THEN
    IF NEW.email IS NOT NULL THEN
      INSERT INTO unsubscribes (workspace_id, email, lead_id, source)
      VALUES (NEW.workspace_id, lower(NEW.email), NEW.id, 'manual')
      ON CONFLICT (workspace_id, email) DO NOTHING;
    END IF;
    NEW.is_unsubscribed := true;
    NEW.unsubscribed_at := COALESCE(NEW.unsubscribed_at, now());
  END IF;
  RETURN NEW;
END;
$function$;

-- Extension of sync_lead_last_contacted: when deleting a call leaves the
-- lead with no remaining call_logs AND the lead's status reflects a prior
-- call (called/voicemail/no_answer/wrong_number/sold_already), reset
-- status to 'new'. This makes "delete the call activity" feel like
-- "undo the call" — the lead returns to its pre-call state.
--
-- Manual statuses (interested, do_not_contact, converted, etc.) are
-- never touched. If other call_logs remain, the status is left as-is
-- (the user can adjust manually if needed).

CREATE OR REPLACE FUNCTION public.sync_lead_last_contacted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected_lead uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.leads
    SET    last_contacted_at = NEW.called_at,
           last_call_outcome = NEW.outcome
    WHERE  id = NEW.lead_id
      AND  (last_contacted_at IS NULL OR NEW.called_at >= last_contacted_at);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Recompute last_contacted_at + last_call_outcome from remaining calls.
    UPDATE public.leads
    SET    last_contacted_at = sub.called_at,
           last_call_outcome = sub.outcome
    FROM   (
      SELECT called_at, outcome
      FROM   public.call_logs
      WHERE  lead_id = OLD.lead_id
      ORDER  BY called_at DESC
      LIMIT  1
    ) sub
    WHERE  leads.id = OLD.lead_id
      AND  OLD.called_at >= leads.last_contacted_at;

    -- Zero remaining calls → null the denorm columns AND reset call-outcome
    -- statuses back to 'new'. Manual statuses are left untouched.
    UPDATE public.leads
    SET    last_contacted_at = NULL,
           last_call_outcome = NULL,
           status = CASE
             WHEN status IN ('called','voicemail','no_answer','wrong_number','sold_already')
             THEN 'new'::lead_status
             ELSE status
           END
    WHERE  id = OLD.lead_id
      AND  NOT EXISTS (SELECT 1 FROM public.call_logs WHERE lead_id = OLD.lead_id);
    RETURN OLD;
  END IF;

  -- UPDATE: handle both OLD.lead_id and NEW.lead_id (lead_id might change).
  FOR affected_lead IN
    SELECT DISTINCT v FROM (VALUES (OLD.lead_id), (NEW.lead_id)) AS t(v)
  LOOP
    UPDATE public.leads
    SET    last_contacted_at = sub.called_at,
           last_call_outcome = sub.outcome
    FROM   (
      SELECT called_at, outcome
      FROM   public.call_logs
      WHERE  lead_id = affected_lead
      ORDER  BY called_at DESC
      LIMIT  1
    ) sub
    WHERE  leads.id = affected_lead;

    UPDATE public.leads
    SET    last_contacted_at = NULL,
           last_call_outcome = NULL,
           status = CASE
             WHEN status IN ('called','voicemail','no_answer','wrong_number','sold_already')
             THEN 'new'::lead_status
             ELSE status
           END
    WHERE  id = affected_lead
      AND  NOT EXISTS (SELECT 1 FROM public.call_logs WHERE lead_id = affected_lead);
  END LOOP;

  RETURN NEW;
END;
$function$;

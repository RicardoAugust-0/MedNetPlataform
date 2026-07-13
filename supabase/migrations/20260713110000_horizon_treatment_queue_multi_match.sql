-- Um alerta tratado na MaxTrack pode corresponder a vários alertas Horizon.
-- Cada par vira uma linha independente, para que o bot trate todos eles.
ALTER TABLE public.horizon_treatment_queue
  ADD COLUMN IF NOT EXISTS match_key text;

UPDATE public.horizon_treatment_queue
SET match_key = COALESCE(horizon_driver_event_id::text, 'unmatched')
WHERE match_key IS NULL;

ALTER TABLE public.horizon_treatment_queue
  ALTER COLUMN match_key SET NOT NULL;

ALTER TABLE public.horizon_treatment_queue
  DROP CONSTRAINT IF EXISTS horizon_treatment_queue_driver_event_id_key;

ALTER TABLE public.horizon_treatment_queue
  DROP CONSTRAINT IF EXISTS horizon_treatment_queue_driver_event_id_match_key_key;

ALTER TABLE public.horizon_treatment_queue
  ADD CONSTRAINT horizon_treatment_queue_driver_event_id_match_key_key
  UNIQUE (driver_event_id, match_key);

CREATE INDEX IF NOT EXISTS horizon_treatment_queue_horizon_event_idx
  ON public.horizon_treatment_queue (horizon_driver_event_id);

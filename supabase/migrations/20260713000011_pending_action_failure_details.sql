-- The task-completion transaction persists a bounded failure reason. The
-- function already expected this column, but legacy schemas never added it.

BEGIN;

ALTER TABLE public.pending_actions
  ADD COLUMN IF NOT EXISTS error_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_actions_error_message_length') THEN
    ALTER TABLE public.pending_actions
      ADD CONSTRAINT pending_actions_error_message_length
      CHECK (error_message IS NULL OR length(error_message) <= 1000) NOT VALID;
  END IF;
END;
$$;

COMMENT ON COLUMN public.pending_actions.error_message
  IS 'Motivo técnico sanitizado quando uma execução transacional falha.';

COMMIT;

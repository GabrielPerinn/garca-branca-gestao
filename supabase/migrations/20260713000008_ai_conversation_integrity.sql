BEGIN;

ALTER TABLE public.pending_actions
  ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_by_phone TEXT,
  ADD COLUMN IF NOT EXISTS input_modality TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS plan_version INTEGER NOT NULL DEFAULT 2;

ALTER TABLE public.ai_clarifications
  ADD COLUMN IF NOT EXISTS last_message_id TEXT,
  ADD COLUMN IF NOT EXISTS input_modality TEXT NOT NULL DEFAULT 'text';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_actions_input_modality_valid') THEN
    ALTER TABLE public.pending_actions
      ADD CONSTRAINT pending_actions_input_modality_valid
      CHECK (input_modality IN ('text', 'audio', 'image')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_actions_plan_version_positive') THEN
    ALTER TABLE public.pending_actions
      ADD CONSTRAINT pending_actions_plan_version_positive
      CHECK (plan_version > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_clarifications_input_modality_valid') THEN
    ALTER TABLE public.ai_clarifications
      ADD CONSTRAINT ai_clarifications_input_modality_valid
      CHECK (input_modality IN ('text', 'audio', 'image')) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_pending_actions_requester_user
  ON public.pending_actions (requested_by_user_id, confirmation_status, created_at DESC)
  WHERE requested_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pending_actions_requester_phone
  ON public.pending_actions (requested_by_phone, confirmation_status, created_at DESC)
  WHERE requested_by_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_clarifications_last_message
  ON public.ai_clarifications (last_message_id)
  WHERE last_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_primary_farm_to_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.related_farm_id IS NULL THEN
    SELECT farm.id INTO NEW.related_farm_id
    FROM public.farms AS farm
    WHERE COALESCE(farm.status, 'active') <> 'deleted'
    ORDER BY farm.created_at, farm.id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_primary_farm_to_task ON public.tasks;
CREATE TRIGGER trg_assign_primary_farm_to_task
BEFORE INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.assign_primary_farm_to_task();

UPDATE public.tasks AS task
SET related_farm_id = farm.id,
    updated_at = clock_timestamp()
FROM LATERAL (
  SELECT candidate.id
  FROM public.farms AS candidate
  WHERE COALESCE(candidate.status, 'active') <> 'deleted'
  ORDER BY candidate.created_at, candidate.id
  LIMIT 1
) AS farm
WHERE task.related_farm_id IS NULL
  AND task.status <> 'deleted';

CREATE OR REPLACE FUNCTION public.maintain_ai_conversation_retention(
  p_redact_after_days INTEGER DEFAULT 30,
  p_batch_size INTEGER DEFAULT 500
)
RETURNS TABLE (expired_count INTEGER, redacted_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expired INTEGER := 0;
  v_redacted INTEGER := 0;
BEGIN
  IF p_redact_after_days < 1 OR p_batch_size < 1 OR p_batch_size > 5000 THEN
    RAISE EXCEPTION 'Parâmetros de retenção inválidos.' USING ERRCODE = '22023';
  END IF;

  WITH expired AS (
    SELECT clarification.id
    FROM public.ai_clarifications AS clarification
    WHERE clarification.status = 'open'
      AND clarification.expires_at <= clock_timestamp()
    ORDER BY clarification.expires_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ai_clarifications AS clarification
  SET status = 'expired', updated_at = clock_timestamp()
  FROM expired
  WHERE clarification.id = expired.id;
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  WITH redactable AS (
    SELECT clarification.id
    FROM public.ai_clarifications AS clarification
    WHERE clarification.status IN ('resolved', 'cancelled', 'expired')
      AND clarification.updated_at < clock_timestamp() - make_interval(days => p_redact_after_days)
      AND clarification.original_text <> '[conteúdo removido pela política de retenção]'
    ORDER BY clarification.updated_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.ai_clarifications AS clarification
  SET original_text = '[conteúdo removido pela política de retenção]',
      plan_json = '{}'::JSONB,
      missing_fields = '[]'::JSONB,
      updated_at = clock_timestamp()
  FROM redactable
  WHERE clarification.id = redactable.id;
  GET DIAGNOSTICS v_redacted = ROW_COUNT;

  RETURN QUERY SELECT v_expired, v_redacted;
END;
$$;

REVOKE ALL ON FUNCTION public.maintain_ai_conversation_retention(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintain_ai_conversation_retention(INTEGER, INTEGER)
  TO service_role;

COMMIT;

-- Resumable, conflict-safe drafts for the livestock operation foundation wizard.

BEGIN;

CREATE TABLE public.foundation_setup_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id UUID NOT NULL REFERENCES public.users_profiles(id) ON DELETE CASCADE,
  operation_id UUID REFERENCES public.farms(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  current_step SMALLINT NOT NULL DEFAULT 0,
  revision BIGINT NOT NULL DEFAULT 1,
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT foundation_setup_drafts_owner_unique UNIQUE (owner_profile_id),
  CONSTRAINT foundation_setup_drafts_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT foundation_setup_drafts_payload_size CHECK (octet_length(payload::TEXT) <= 250000),
  CONSTRAINT foundation_setup_drafts_step_valid CHECK (current_step BETWEEN 0 AND 8),
  CONSTRAINT foundation_setup_drafts_revision_positive CHECK (revision > 0)
);

CREATE INDEX idx_foundation_setup_drafts_operation
  ON public.foundation_setup_drafts(operation_id) WHERE operation_id IS NOT NULL;

CREATE TRIGGER set_updated_at_foundation_setup_drafts
  BEFORE UPDATE ON public.foundation_setup_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.foundation_setup_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.foundation_setup_drafts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.foundation_setup_drafts TO service_role;

CREATE OR REPLACE FUNCTION public.save_foundation_setup_draft(
  p_owner_profile_id UUID,
  p_operation_id UUID,
  p_payload JSONB,
  p_current_step INTEGER,
  p_expected_revision BIGINT DEFAULT NULL
)
RETURNS TABLE (revision BIGINT, last_saved_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.foundation_setup_drafts%ROWTYPE;
BEGIN
  IF p_owner_profile_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users_profiles
    WHERE id = p_owner_profile_id AND is_active = true
      AND lower(role) IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Somente a administração pode salvar a implantação.' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR octet_length(p_payload::TEXT) > 250000 THEN
    RAISE EXCEPTION 'O rascunho da implantação é inválido ou excede o limite permitido.' USING ERRCODE = '22023';
  END IF;
  IF p_current_step NOT BETWEEN 0 AND 8 THEN
    RAISE EXCEPTION 'Etapa da implantação inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_operation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.farms
    WHERE id = p_operation_id AND COALESCE(status, 'active') <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'Operação pecuária do rascunho não foi encontrada.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.foundation_setup_drafts
  WHERE owner_profile_id = p_owner_profile_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_revision IS NULL OR p_expected_revision <> v_existing.revision THEN
      RAISE EXCEPTION 'Este rascunho foi atualizado em outra aba ou aparelho. Recarregue a página antes de continuar.'
        USING ERRCODE = '40001';
    END IF;
    UPDATE public.foundation_setup_drafts
    SET operation_id = p_operation_id,
        payload = p_payload,
        current_step = p_current_step,
        revision = v_existing.revision + 1,
        last_saved_at = clock_timestamp()
    WHERE id = v_existing.id
    RETURNING foundation_setup_drafts.revision, foundation_setup_drafts.last_saved_at
      INTO revision, last_saved_at;
  ELSE
    IF p_expected_revision IS NOT NULL THEN
      RAISE EXCEPTION 'O rascunho não existe mais. Recarregue a página antes de continuar.' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.foundation_setup_drafts (
      owner_profile_id, operation_id, payload, current_step
    ) VALUES (
      p_owner_profile_id, p_operation_id, p_payload, p_current_step
    )
    RETURNING foundation_setup_drafts.revision, foundation_setup_drafts.last_saved_at
      INTO revision, last_saved_at;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.save_foundation_setup_draft(UUID, UUID, JSONB, INTEGER, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_foundation_setup_draft(UUID, UUID, JSONB, INTEGER, BIGINT)
  TO service_role;

COMMENT ON TABLE public.foundation_setup_drafts IS
  'Rascunhos parciais e retomáveis da implantação da operação pecuária, isolados dos registros oficiais.';
COMMENT ON FUNCTION public.save_foundation_setup_draft(UUID, UUID, JSONB, INTEGER, BIGINT) IS
  'Salva uma etapa parcial com controle otimista de concorrência entre abas e aparelhos.';

COMMIT;

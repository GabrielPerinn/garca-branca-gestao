-- Add transactional AI approval for gravel extraction and environmental
-- suppression records without widening the legacy generic executor.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gravel_loads_positive') THEN
    ALTER TABLE public.gravel_operations
      ADD CONSTRAINT gravel_loads_positive
      CHECK (loads_quantity IS NULL OR loads_quantity > 0) NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_field_operation_pending_action(
  p_action_id UUID,
  p_expected_source_message_id TEXT,
  p_payload JSONB,
  p_actor_profile_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending public.pending_actions%ROWTYPE;
  v_expired public.pending_actions%ROWTYPE;
  v_record_id UUID;
  v_actor_id UUID;
  v_error TEXT;
  v_operation_date DATE;
  v_loads INTEGER;
  v_volume NUMERIC;
  v_area NUMERIC;
BEGIN
  IF p_action_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN QUERY SELECT false, 'Ação e dados estruturados são obrigatórios.'::TEXT;
    RETURN;
  END IF;

  UPDATE public.pending_actions AS pending
  SET confirmation_status = 'expired', updated_at = clock_timestamp()
  WHERE pending.id = p_action_id
    AND pending.confirmation_status = 'pending'
    AND pending.expires_at IS NOT NULL
    AND pending.expires_at <= clock_timestamp()
    AND (p_expected_source_message_id IS NULL OR pending.source_message_id = p_expected_source_message_id)
  RETURNING pending.* INTO v_expired;

  IF FOUND THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, before_data_json, after_data_json,
      changed_by, reason, source_message_id
    ) VALUES (
      'pending_actions', v_expired.id, 'expire_pending_action',
      jsonb_build_object('confirmation_status', 'pending'),
      jsonb_build_object('confirmation_status', 'expired'),
      NULL, 'A ação expirou antes da aprovação.', v_expired.source_message_id
    );
    RETURN QUERY SELECT false, 'Ação expirada.'::TEXT;
    RETURN;
  END IF;

  UPDATE public.pending_actions AS pending
  SET confirmation_status = 'processing', updated_at = clock_timestamp()
  WHERE pending.id = p_action_id
    AND pending.confirmation_status = 'pending'
    AND (pending.expires_at IS NULL OR pending.expires_at > clock_timestamp())
    AND (p_expected_source_message_id IS NULL OR pending.source_message_id = p_expected_source_message_id)
    AND pending.action_type IN ('record_gravel_operation', 'record_suppression_operation')
  RETURNING pending.* INTO v_pending;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Ação não encontrada, já processada ou vinculada a outra conversa.'::TEXT;
    RETURN;
  END IF;

  SELECT profile.id INTO v_actor_id
  FROM public.users_profiles AS profile
  WHERE profile.id = p_actor_profile_id AND profile.is_active = true
  LIMIT 1;

  BEGIN
    v_operation_date := NULLIF(p_payload->>'operation_date', '')::DATE;
    IF v_operation_date IS NULL THEN
      RAISE EXCEPTION 'Data da operação é obrigatória.' USING ERRCODE = '22023';
    END IF;

    CASE v_pending.action_type
      WHEN 'record_gravel_operation' THEN
        v_loads := NULLIF(p_payload->>'loads_quantity', '')::INTEGER;
        v_volume := NULLIF(p_payload->>'estimated_volume', '')::NUMERIC;
        IF NULLIF(btrim(p_payload->>'origin_location'), '') IS NULL THEN
          RAISE EXCEPTION 'Local de origem do cascalho é obrigatório.' USING ERRCODE = '22023';
        END IF;
        IF (v_loads IS NULL OR v_loads <= 0) AND (v_volume IS NULL OR v_volume <= 0) THEN
          RAISE EXCEPTION 'Informe quantidade de cargas ou volume positivo.' USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.gravel_operations (
          operation_date, operation_type, loads_quantity, estimated_volume,
          origin_location, destination_location, purpose, machine_used,
          responsible_person, notes, status
        ) VALUES (
          v_operation_date, 'extraction', v_loads, v_volume,
          btrim(p_payload->>'origin_location'), NULLIF(btrim(p_payload->>'destination_location'), ''),
          NULLIF(btrim(p_payload->>'purpose'), ''), NULLIF(btrim(p_payload->>'machine_used'), ''),
          NULLIF(btrim(p_payload->>'responsible_person'), ''), NULLIF(btrim(p_payload->>'notes'), ''), 'active'
        ) RETURNING id INTO v_record_id;

      WHEN 'record_suppression_operation' THEN
        v_area := NULLIF(p_payload->>'approximate_area', '')::NUMERIC;
        IF v_area IS NULL OR v_area <= 0 THEN
          RAISE EXCEPTION 'Área aproximada positiva é obrigatória.' USING ERRCODE = '22023';
        END IF;
        IF NULLIF(btrim(p_payload->>'notes'), '') IS NULL
          OR NULLIF(btrim(p_payload->>'authorization_number'), '') IS NULL THEN
          RAISE EXCEPTION 'Localização/observações e autorização ambiental são obrigatórias.' USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.suppression_operations (
          operation_date, operation_type, authorization_number,
          authorization_expiration_date, responsible_technician,
          approximate_area, notes, status
        ) VALUES (
          v_operation_date, 'clearing', btrim(p_payload->>'authorization_number'),
          NULLIF(p_payload->>'authorization_expiration_date', '')::DATE,
          NULLIF(btrim(p_payload->>'responsible_technician'), ''),
          v_area, btrim(p_payload->>'notes'), 'active'
        ) RETURNING id INTO v_record_id;
    END CASE;

    UPDATE public.pending_actions
    SET confirmation_status = 'completed', confirmed_by = v_actor_id,
        confirmed_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = v_pending.id;

    INSERT INTO public.audit_logs (
      table_name, record_id, action, before_data_json, after_data_json,
      changed_by, reason, source_message_id
    ) VALUES (
      'pending_actions', v_pending.id, 'execute_pending_action',
      jsonb_build_object('confirmation_status', 'pending'),
      jsonb_build_object(
        'confirmation_status', 'completed',
        'action_type', v_pending.action_type,
        'execution_result_id', v_record_id
      ),
      v_actor_id, COALESCE(NULLIF(btrim(p_reason), ''), 'Approved field operation'),
      v_pending.source_message_id
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    v_error := left(COALESCE(v_error, 'Falha ao executar operação de campo.'), 1_000);
    UPDATE public.pending_actions
    SET confirmation_status = 'failed', updated_at = clock_timestamp()
    WHERE id = v_pending.id;
    INSERT INTO public.audit_logs (
      table_name, record_id, action, before_data_json, after_data_json,
      changed_by, reason, source_message_id
    ) VALUES (
      'pending_actions', v_pending.id, 'fail_pending_action',
      jsonb_build_object('confirmation_status', 'processing'),
      jsonb_build_object('confirmation_status', 'failed', 'error_message', v_error),
      v_actor_id, v_error, v_pending.source_message_id
    );
    RETURN QUERY SELECT false, v_error;
    RETURN;
  END;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_field_operation_pending_action(UUID, TEXT, JSONB, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_field_operation_pending_action(UUID, TEXT, JSONB, UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.execute_field_operation_pending_action(UUID, TEXT, JSONB, UUID, TEXT)
  IS 'Aprova e executa registros de cascalheira/supressão de forma atômica e auditável.';

COMMIT;

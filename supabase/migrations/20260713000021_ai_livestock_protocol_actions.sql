-- First-class Garça actions for collective health/reproduction protocols.

BEGIN;

ALTER TABLE public.livestock_protocols
  ADD COLUMN source_message_id TEXT REFERENCES public.incoming_messages(external_message_id) ON DELETE SET NULL;
ALTER TABLE public.livestock_protocol_executions
  ADD COLUMN source_message_id TEXT REFERENCES public.incoming_messages(external_message_id) ON DELETE SET NULL;
CREATE INDEX idx_livestock_protocols_source_message ON public.livestock_protocols(source_message_id) WHERE source_message_id IS NOT NULL;
CREATE INDEX idx_livestock_executions_source_message ON public.livestock_protocol_executions(source_message_id) WHERE source_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.execute_pending_action_transactional_v3(
  p_action_id UUID,
  p_expected_source_message_id TEXT,
  p_steps JSONB,
  p_actor_profile_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_protocol_steps JSONB;
  v_domain_steps JSONB;
  v_step JSONB;
  v_payload JSONB;
  v_action_type TEXT;
  v_source_message_id TEXT;
  v_pending_status TEXT;
  v_success BOOLEAN;
  v_error TEXT;
  v_protocol_id UUID;
  v_execution_id UUID;
BEGIN
  IF jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) = 0 THEN
    RETURN QUERY SELECT false, 'O plano de execução está vazio ou inválido.'::TEXT;
    RETURN;
  END IF;
  SELECT COALESCE(jsonb_agg(value) FILTER (WHERE value->>'action_type' IN ('create_livestock_protocol', 'complete_livestock_protocol')), '[]'::JSONB),
         COALESCE(jsonb_agg(value) FILTER (WHERE value->>'action_type' NOT IN ('create_livestock_protocol', 'complete_livestock_protocol')), '[]'::JSONB)
  INTO v_protocol_steps, v_domain_steps
  FROM jsonb_array_elements(p_steps);

  IF jsonb_array_length(v_protocol_steps) = 0 THEN
    RETURN QUERY SELECT result.success, result.error_message
    FROM public.execute_pending_action_transactional_v2(
      p_action_id, p_expected_source_message_id, p_steps,
      p_actor_profile_id, p_reason
    ) AS result;
    RETURN;
  END IF;

  BEGIN
    SELECT source_message_id, confirmation_status
    INTO v_source_message_id, v_pending_status
    FROM public.pending_actions WHERE id = p_action_id;

    IF jsonb_array_length(v_domain_steps) > 0 THEN
      SELECT result.success, result.error_message INTO v_success, v_error
      FROM public.execute_pending_action_transactional_v2(
        p_action_id, p_expected_source_message_id, v_domain_steps,
        p_actor_profile_id, p_reason
      ) AS result;
      IF NOT COALESCE(v_success, false) THEN
        RETURN QUERY SELECT false, COALESCE(v_error, 'Não foi possível executar o plano.')::TEXT;
        RETURN;
      END IF;
    ELSE
      UPDATE public.pending_actions
      SET confirmation_status = 'expired', updated_at = clock_timestamp()
      WHERE id = p_action_id AND confirmation_status = 'pending'
        AND expires_at IS NOT NULL AND expires_at <= clock_timestamp()
        AND (p_expected_source_message_id IS NULL OR source_message_id = p_expected_source_message_id);
      IF FOUND THEN
        RETURN QUERY SELECT false, 'Ação expirada.'::TEXT;
        RETURN;
      END IF;
      UPDATE public.pending_actions
      SET confirmation_status = 'processing', updated_at = clock_timestamp()
      WHERE id = p_action_id AND confirmation_status = 'pending'
        AND (expires_at IS NULL OR expires_at > clock_timestamp())
        AND (p_expected_source_message_id IS NULL OR source_message_id = p_expected_source_message_id)
      RETURNING source_message_id INTO v_source_message_id;
      IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Ação não encontrada, expirada ou já processada.'::TEXT;
        RETURN;
      END IF;
    END IF;

    FOR v_step IN SELECT value FROM jsonb_array_elements(v_protocol_steps) LOOP
      v_action_type := v_step->>'action_type';
      v_payload := v_step->'payload';
      IF v_action_type = 'create_livestock_protocol' THEN
        INSERT INTO public.livestock_protocols (
          farm_id, land_parcel_id, cattle_lot_id, responsible_employee_id,
          name, protocol_type, event_type, scope_type, animal_category,
          product_name, dosage, withdrawal_days, instructions, next_due_date,
          recurrence_days, alert_lead_days, status, created_by, source_message_id
        ) VALUES (
          public.try_uuid(v_payload->>'farm_id'), public.try_uuid(v_payload->>'land_parcel_id'),
          public.try_uuid(v_payload->>'cattle_lot_id'), public.try_uuid(v_payload->>'responsible_employee_id'),
          NULLIF(btrim(v_payload->>'name'), ''), v_payload->>'protocol_type',
          NULLIF(btrim(v_payload->>'event_type'), ''), v_payload->>'scope_type',
          NULLIF(btrim(v_payload->>'animal_category'), ''), NULLIF(btrim(v_payload->>'product_name'), ''),
          NULLIF(btrim(v_payload->>'dosage'), ''), NULLIF(v_payload->>'withdrawal_days', '')::INTEGER,
          NULLIF(btrim(v_payload->>'instructions'), ''), NULLIF(v_payload->>'next_due_date', '')::DATE,
          NULLIF(v_payload->>'recurrence_days', '')::INTEGER,
          COALESCE(NULLIF(v_payload->>'alert_lead_days', '')::INTEGER, 7),
          'active', p_actor_profile_id, v_source_message_id
        ) RETURNING id INTO v_protocol_id;
      ELSIF v_action_type = 'complete_livestock_protocol' THEN
        SELECT public.complete_livestock_protocol(
          public.try_uuid(v_payload->>'protocol_id'),
          NULLIF(v_payload->>'executed_on', '')::DATE,
          NULLIF(v_payload->>'quantity_treated', '')::INTEGER,
          COALESCE(NULLIF(v_payload->>'result_status', ''), 'completed'),
          NULLIF(btrim(v_payload->>'notes'), ''),
          NULLIF(v_payload->>'next_due_date', '')::DATE,
          p_actor_profile_id
        ) INTO v_execution_id;
        UPDATE public.livestock_protocol_executions
        SET source_message_id = v_source_message_id
        WHERE id = v_execution_id;
      ELSE
        RAISE EXCEPTION 'Ação de protocolo não suportada.' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF jsonb_array_length(v_domain_steps) = 0 THEN
      UPDATE public.pending_actions
      SET confirmation_status = 'completed', confirmed_by = p_actor_profile_id,
          confirmed_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE id = p_action_id AND confirmation_status = 'processing';
      IF NOT FOUND THEN RAISE EXCEPTION 'A ação perdeu o estado de processamento.' USING ERRCODE = '40001'; END IF;
    END IF;
    INSERT INTO public.audit_logs (
      table_name, record_id, action, before_data_json, after_data_json,
      changed_by, reason, source_message_id
    ) VALUES (
      'pending_actions', p_action_id, 'approve_livestock_protocol_plan',
      jsonb_build_object('confirmation_status', 'pending'),
      jsonb_build_object('confirmation_status', 'completed', 'steps', p_steps),
      p_actor_profile_id, COALESCE(NULLIF(btrim(p_reason), ''), 'Plano pecuário aprovado pela Garça.'),
      v_source_message_id
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_error := left(SQLERRM, 1000);
      UPDATE public.pending_actions
      SET confirmation_status = 'failed', error_message = v_error,
          confirmed_by = NULL, confirmed_at = NULL, updated_at = clock_timestamp()
      WHERE id = p_action_id AND confirmation_status = 'pending';
      INSERT INTO public.audit_logs (
        table_name, record_id, action, before_data_json, after_data_json,
        changed_by, reason, source_message_id
      ) VALUES (
        'pending_actions', p_action_id, 'execute_livestock_protocol_plan_failed',
        jsonb_build_object('confirmation_status', 'pending'),
        jsonb_build_object('confirmation_status', 'failed', 'error', v_error, 'steps', p_steps),
        p_actor_profile_id, v_error, v_source_message_id
      );
      RETURN QUERY SELECT false, v_error;
      RETURN;
  END;
  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_pending_action_transactional_v3(UUID, TEXT, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_pending_action_transactional_v3(UUID, TEXT, JSONB, UUID, TEXT) TO service_role;

COMMIT;

-- Preserve every manual weight extracted from text, audio or a paper photo.
-- The existing generic executor remains the source of domain rules; this v2
-- wrapper enriches weighings in the same transaction and rolls everything back
-- if the declared arithmetic or row matching is inconsistent.

BEGIN;

CREATE OR REPLACE FUNCTION public.execute_pending_action_transactional_v2(
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
  v_success BOOLEAN;
  v_error TEXT;
  v_source_message_id TEXT;
  v_step JSONB;
  v_payload JSONB;
  v_weights JSONB;
  v_weight NUMERIC;
  v_count INTEGER;
  v_total NUMERIC;
  v_average NUMERIC;
  v_declared_count INTEGER;
  v_declared_total NUMERIC;
  v_declared_average NUMERIC;
  v_lot_id UUID;
  v_weighing_date DATE;
  v_match_count INTEGER;
  v_weighing_id UUID;
BEGIN
  BEGIN
    SELECT pending.source_message_id
    INTO v_source_message_id
    FROM public.pending_actions AS pending
    WHERE pending.id = p_action_id;

    SELECT result.success, result.error_message
    INTO v_success, v_error
    FROM public.execute_pending_action_transactional(
      p_action_id,
      p_expected_source_message_id,
      p_steps,
      p_actor_profile_id,
      p_reason
    ) AS result;

    IF NOT COALESCE(v_success, false) THEN
      RETURN QUERY SELECT false, COALESCE(v_error, 'Não foi possível executar a ação.')::TEXT;
      RETURN;
    END IF;

    FOR v_step IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
      IF v_step->>'action_type' <> 'record_weighing' THEN CONTINUE; END IF;
      v_payload := v_step->'payload';
      v_weights := v_payload->'individual_weights';
      IF v_weights IS NULL OR v_weights = 'null'::JSONB THEN CONTINUE; END IF;
      IF jsonb_typeof(v_weights) <> 'array' OR jsonb_array_length(v_weights) = 0 THEN
        RAISE EXCEPTION 'A lista de pesos individuais está vazia ou inválida.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(v_weights) > 2000 THEN
        RAISE EXCEPTION 'A pesagem excede 2.000 animais.' USING ERRCODE = '54000';
      END IF;

      v_count := 0;
      v_total := 0;
      FOR v_weight IN SELECT value::NUMERIC FROM jsonb_array_elements_text(v_weights) LOOP
        IF v_weight <= 0 OR v_weight > 2000 THEN
          RAISE EXCEPTION 'A lista possui peso fora da faixa permitida.' USING ERRCODE = '22023';
        END IF;
        v_count := v_count + 1;
        v_total := v_total + v_weight;
      END LOOP;
      v_total := round(v_total, 3);
      v_average := round(v_total / v_count, 3);
      v_declared_count := NULLIF(v_payload->>'quantity_weighed', '')::INTEGER;
      v_declared_total := NULLIF(v_payload->>'total_weight', '')::NUMERIC;
      v_declared_average := NULLIF(v_payload->>'average_weight', '')::NUMERIC;
      IF v_declared_count IS DISTINCT FROM v_count
        OR v_declared_total IS NULL OR abs(v_declared_total - v_total) > 0.1
        OR v_declared_average IS NULL OR abs(v_declared_average - v_average) > 0.1 THEN
        RAISE EXCEPTION 'A lista de pesos não fecha com quantidade, total e média declarados.' USING ERRCODE = '23514';
      END IF;

      v_lot_id := public.try_uuid(v_payload->>'cattle_lot_id');
      v_weighing_date := NULLIF(v_payload->>'weighing_date', '')::DATE;
      SELECT count(*)::INTEGER, min(weighing.id::TEXT)::UUID
      INTO v_match_count, v_weighing_id
      FROM public.weighings AS weighing
      WHERE weighing.source_message_id IS NOT DISTINCT FROM v_source_message_id
        AND weighing.cattle_lot_id = v_lot_id
        AND weighing.weighing_date = v_weighing_date
        AND weighing.quantity_weighed = v_count
        AND abs(weighing.average_weight - v_average) <= 0.1
        AND weighing.individual_weights_json IS NULL
        AND COALESCE(weighing.status, 'active') <> 'deleted';
      IF v_match_count <> 1 THEN
        RAISE EXCEPTION 'Não foi possível vincular com segurança a lista à pesagem criada.' USING ERRCODE = '21000';
      END IF;

      UPDATE public.weighings
      SET individual_weights_json = v_weights,
          quantity_weighed = v_count,
          total_weight = v_total,
          average_weight = v_average
      WHERE id = v_weighing_id;
    END LOOP;
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
        'pending_actions', p_action_id, 'execute_pending_action_v2_failed',
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

REVOKE ALL ON FUNCTION public.execute_pending_action_transactional_v2(UUID, TEXT, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_pending_action_transactional_v2(UUID, TEXT, JSONB, UUID, TEXT) TO service_role;

COMMIT;

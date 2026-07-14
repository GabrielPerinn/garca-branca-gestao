BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_task_pending_action(
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
  v_task public.tasks%ROWTYPE;
  v_task_id UUID;
BEGIN
  UPDATE public.pending_actions AS pending
  SET confirmation_status = 'processing', updated_at = clock_timestamp()
  WHERE pending.id = p_action_id
    AND pending.action_type = 'cancel_task'
    AND pending.confirmation_status = 'pending'
    AND (pending.expires_at IS NULL OR pending.expires_at > clock_timestamp())
    AND (p_expected_source_message_id IS NULL OR pending.source_message_id = p_expected_source_message_id)
  RETURNING pending.* INTO v_pending;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Ação não encontrada, expirada ou já processada.'::TEXT;
    RETURN;
  END IF;

  BEGIN
    v_task_id := NULLIF(p_payload->>'task_id', '')::UUID;
    IF v_task_id IS NULL THEN
      RAISE EXCEPTION 'A tarefa é obrigatória.' USING ERRCODE = '22023';
    END IF;

    SELECT task.* INTO v_task
    FROM public.tasks AS task
    WHERE task.id = v_task_id
      AND task.status IN ('pending', 'in_progress')
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tarefa não encontrada ou já encerrada.' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.tasks
    SET status = 'cancelled', completed_at = NULL, updated_at = clock_timestamp()
    WHERE id = v_task.id;

    UPDATE public.pending_actions
    SET confirmation_status = 'completed', confirmed_by = p_actor_profile_id,
        confirmed_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = v_pending.id AND confirmation_status = 'processing';

    INSERT INTO public.audit_logs (
      table_name, record_id, action, before_data_json, after_data_json,
      changed_by, reason, source_message_id
    ) VALUES (
      'tasks', v_task.id, 'cancel_task_via_ai', to_jsonb(v_task),
      jsonb_build_object('status', 'cancelled'),
      p_actor_profile_id, COALESCE(p_reason, 'Confirmação via Garça Branca'), v_pending.source_message_id
    );

    RETURN QUERY SELECT true, NULL::TEXT;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pending_actions
    SET confirmation_status = 'failed', error_message = left(SQLERRM, 1000), updated_at = clock_timestamp()
    WHERE id = v_pending.id AND confirmation_status = 'processing';
    RETURN QUERY SELECT false, SQLERRM::TEXT;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_task_pending_action(UUID, TEXT, JSONB, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_task_pending_action(UUID, TEXT, JSONB, UUID, TEXT)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cancel_task_pending_action(UUID, TEXT, JSONB, UUID, TEXT)
  IS 'Cancela uma tarefa aberta somente após aprovação de uma ação da Garça Branca, com bloqueio e auditoria.';

COMMIT;

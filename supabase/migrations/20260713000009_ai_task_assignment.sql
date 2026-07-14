BEGIN;

CREATE OR REPLACE FUNCTION public.assign_ai_task_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending RECORD;
  v_secondary JSONB;
  v_action_data JSONB;
  v_assignee_name TEXT;
  v_matching_plans INTEGER := 0;
  v_employee_id UUID;
  v_employee_matches INTEGER;
BEGIN
  FOR v_pending IN
    SELECT pending.action_type, pending.interpreted_data_json
    FROM public.pending_actions AS pending
    WHERE pending.confirmation_status = 'processing'
      AND pending.created_at > clock_timestamp() - INTERVAL '24 hours'
      AND (
        pending.source_message_id = NEW.source_message_id
        OR (pending.source_message_id IS NULL AND NEW.source_message_id IS NULL)
      )
    ORDER BY pending.created_at DESC
    LIMIT 20
  LOOP
    v_action_data := NULL;
    IF v_pending.action_type = 'create_task'
      AND NULLIF(btrim(v_pending.interpreted_data_json->>'title'), '') = NEW.title THEN
      v_action_data := v_pending.interpreted_data_json;
    ELSE
      FOR v_secondary IN
        SELECT value FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(v_pending.interpreted_data_json->'secondary_actions') = 'array'
              THEN v_pending.interpreted_data_json->'secondary_actions'
            ELSE '[]'::JSONB
          END
        )
      LOOP
        IF v_secondary->>'intent' <> 'create_task' THEN CONTINUE; END IF;
        BEGIN
          v_action_data := (v_secondary->>'extracted_data')::JSONB;
        EXCEPTION WHEN OTHERS THEN
          v_action_data := NULL;
        END;
        IF v_action_data->>'title' = NEW.title THEN EXIT; END IF;
        v_action_data := NULL;
      END LOOP;
    END IF;

    IF v_action_data IS NOT NULL THEN
      v_matching_plans := v_matching_plans + 1;
      v_assignee_name := COALESCE(
        NULLIF(btrim(v_action_data->>'assigned_to'), ''),
        NULLIF(btrim(v_action_data->>'employee_name'), '')
      );
    END IF;
  END LOOP;

  IF v_matching_plans > 1 THEN
    RAISE EXCEPTION 'Mais de um plano em execução corresponde à tarefa %.', NEW.title USING ERRCODE = '21000';
  END IF;
  IF v_matching_plans = 0 OR v_assignee_name IS NULL THEN RETURN NEW; END IF;

  SELECT count(*), (array_agg(employee.id))[1]
  INTO v_employee_matches, v_employee_id
  FROM public.employees AS employee
  WHERE COALESCE(employee.status, 'active') <> 'deleted'
    AND lower(btrim(employee.full_name)) = lower(v_assignee_name);

  IF v_employee_matches = 0 THEN
    SELECT count(*), (array_agg(employee.id))[1]
    INTO v_employee_matches, v_employee_id
    FROM public.employees AS employee
    WHERE COALESCE(employee.status, 'active') <> 'deleted'
      AND lower(employee.full_name) LIKE '%' || lower(v_assignee_name) || '%';
  END IF;

  IF v_employee_matches = 0 THEN
    RAISE EXCEPTION 'Funcionário responsável não encontrado: %.', v_assignee_name USING ERRCODE = 'P0002';
  END IF;
  IF v_employee_matches > 1 THEN
    RAISE EXCEPTION 'O responsável % corresponde a mais de um funcionário.', v_assignee_name USING ERRCODE = '21000';
  END IF;

  NEW.assigned_to_employee_id := v_employee_id;
  NEW.description := CASE
    WHEN NULLIF(btrim(NEW.description), '') IS NULL THEN 'Responsável: ' || v_assignee_name
    WHEN NEW.description ILIKE '%responsável:%' THEN NEW.description
    ELSE NEW.description || E'\nResponsável: ' || v_assignee_name
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_ai_task_employee ON public.tasks;
CREATE TRIGGER trg_assign_ai_task_employee
BEFORE INSERT ON public.tasks
FOR EACH ROW
WHEN (NEW.assigned_to_employee_id IS NULL)
EXECUTE FUNCTION public.assign_ai_task_employee();

COMMIT;

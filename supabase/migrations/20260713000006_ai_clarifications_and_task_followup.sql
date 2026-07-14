BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_clarifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID,
  sender_phone TEXT,
  source_message_id TEXT,
  original_text TEXT NOT NULL,
  plan_json JSONB NOT NULL,
  missing_fields JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'open',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ai_clarifications_sender_present CHECK (sender_user_id IS NOT NULL OR sender_phone IS NOT NULL),
  CONSTRAINT ai_clarifications_status_valid CHECK (status IN ('open', 'resolved', 'cancelled', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_ai_clarifications_user_open
  ON public.ai_clarifications (sender_user_id, created_at DESC)
  WHERE status = 'open' AND sender_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_clarifications_phone_open
  ON public.ai_clarifications (sender_phone, created_at DESC)
  WHERE status = 'open' AND sender_phone IS NOT NULL;

ALTER TABLE public.ai_clarifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_clarifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_clarifications TO service_role;

DROP TRIGGER IF EXISTS trg_ai_clarifications_updated_at ON public.ai_clarifications;
CREATE TRIGGER trg_ai_clarifications_updated_at
BEFORE UPDATE ON public.ai_clarifications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_active_alert
  ON public.alerts (related_table, related_id)
  WHERE related_table = 'tasks' AND status <> 'deleted';

CREATE OR REPLACE FUNCTION public.sync_task_followup_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.alerts
    SET status = 'deleted', updated_at = clock_timestamp()
    WHERE related_table = 'tasks' AND related_id = OLD.id AND status <> 'deleted';
    RETURN OLD;
  END IF;

  IF NEW.status IN ('completed', 'cancelled', 'deleted') OR NEW.due_date IS NULL THEN
    UPDATE public.alerts
    SET status = CASE WHEN NEW.status = 'completed' THEN 'completed' ELSE 'deleted' END,
        title = CASE WHEN NEW.status = 'completed' THEN 'Tarefa concluída: ' || NEW.title ELSE title END,
        updated_at = clock_timestamp()
    WHERE related_table = 'tasks' AND related_id = NEW.id AND status <> 'deleted';
    RETURN NEW;
  END IF;

  INSERT INTO public.alerts (
    alert_type, title, message, due_date, related_table, related_id, recipient_user_id, status
  ) VALUES (
    'task_followup',
    'Acompanhar tarefa: ' || NEW.title,
    'No prazo, confirme se a tarefa foi concluída. A Garça Branca pode atualizar o sistema pela conversa.',
    NEW.due_date,
    'tasks',
    NEW.id,
    NEW.assigned_to_user_id,
    'pending'
  )
  ON CONFLICT (related_table, related_id)
    WHERE related_table = 'tasks' AND status <> 'deleted'
  DO UPDATE SET
    title = EXCLUDED.title,
    message = EXCLUDED.message,
    due_date = EXCLUDED.due_date,
    recipient_user_id = EXCLUDED.recipient_user_id,
    status = 'pending',
    updated_at = clock_timestamp();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_task_followup_alert ON public.tasks;
CREATE TRIGGER trg_sync_task_followup_alert
AFTER INSERT OR UPDATE OR DELETE
ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_task_followup_alert();

CREATE OR REPLACE FUNCTION public.complete_task_pending_action(
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
    AND pending.action_type = 'complete_task'
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
    WHERE task.id = v_task_id AND task.status IN ('pending', 'in_progress')
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tarefa não encontrada ou já concluída.' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.tasks
    SET status = 'completed', completed_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = v_task.id;

    UPDATE public.pending_actions
    SET confirmation_status = 'completed', confirmed_by = p_actor_profile_id,
        confirmed_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = v_pending.id AND confirmation_status = 'processing';

    INSERT INTO public.audit_logs (
      table_name, record_id, action, before_data_json, after_data_json,
      changed_by, reason, source_message_id
    ) VALUES (
      'tasks', v_task.id, 'complete_task_via_ai', to_jsonb(v_task),
      jsonb_build_object('status', 'completed', 'completed_at', clock_timestamp()),
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

REVOKE ALL ON FUNCTION public.complete_task_pending_action(UUID, TEXT, JSONB, UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_task_pending_action(UUID, TEXT, JSONB, UUID, TEXT)
  TO authenticated, service_role;

COMMIT;

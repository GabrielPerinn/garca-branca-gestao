-- Idempotent server-side gateway for commands captured without connectivity.

BEGIN;

CREATE TABLE public.offline_commands (
  id UUID PRIMARY KEY,
  actor_profile_id UUID NOT NULL REFERENCES public.users_profiles(id) ON DELETE RESTRICT,
  command_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  device_id TEXT,
  client_created_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT offline_command_type_valid CHECK (command_type IN ('complete_livestock_protocol')),
  CONSTRAINT offline_command_status_valid CHECK (status IN ('queued', 'processing', 'processed', 'failed')),
  CONSTRAINT offline_command_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT offline_command_attempts_valid CHECK (attempt_count >= 0)
);

CREATE INDEX idx_offline_commands_actor_status
  ON public.offline_commands (actor_profile_id, status, client_created_at);
CREATE INDEX idx_offline_commands_failed
  ON public.offline_commands (updated_at)
  WHERE status = 'failed';

CREATE OR REPLACE FUNCTION public.process_offline_livestock_command(
  p_command_id UUID,
  p_actor_profile_id UUID,
  p_payload JSONB,
  p_device_id TEXT DEFAULT NULL,
  p_client_created_at TIMESTAMPTZ DEFAULT clock_timestamp()
)
RETURNS TABLE (success BOOLEAN, error_message TEXT, already_processed BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_command public.offline_commands%ROWTYPE;
  v_protocol_id UUID;
  v_protocol_name TEXT;
  v_matches INTEGER;
  v_payload JSONB;
BEGIN
  IF p_command_id IS NULL OR p_actor_profile_id IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN QUERY SELECT false, 'Comando offline inválido.'::TEXT, false;
    RETURN;
  END IF;

  INSERT INTO public.offline_commands (
    id, actor_profile_id, command_type, payload, device_id, client_created_at
  ) VALUES (
    p_command_id, p_actor_profile_id, 'complete_livestock_protocol', p_payload,
    NULLIF(btrim(p_device_id), ''), p_client_created_at
  ) ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_command FROM public.offline_commands WHERE id = p_command_id FOR UPDATE;
  IF v_command.actor_profile_id <> p_actor_profile_id THEN
    RETURN QUERY SELECT false, 'O comando pertence a outro usuário.'::TEXT, false;
    RETURN;
  END IF;
  IF v_command.status = 'processed' THEN
    RETURN QUERY SELECT true, NULL::TEXT, true;
    RETURN;
  END IF;

  -- A primeira versão recebida é a fonte imutável do comando. Uma nova
  -- tentativa com o mesmo UUID nunca pode trocar silenciosamente seu conteúdo.
  v_payload := v_command.payload;

  UPDATE public.offline_commands SET
    status = 'processing', attempt_count = attempt_count + 1,
    error_message = NULL, updated_at = clock_timestamp()
  WHERE id = p_command_id;

  BEGIN
    v_protocol_id := public.try_uuid(v_payload->>'protocol_id');
    IF v_protocol_id IS NULL THEN
      v_protocol_name := NULLIF(btrim(v_payload->>'protocol_name'), '');
      IF v_protocol_name IS NULL THEN
        RAISE EXCEPTION 'Informe o protocolo realizado.' USING ERRCODE = '22023';
      END IF;
      SELECT count(*), min(id::TEXT)::UUID INTO v_matches, v_protocol_id
      FROM public.livestock_protocols
      WHERE lower(name) = lower(v_protocol_name) AND status = 'active';
      IF v_matches = 0 THEN RAISE EXCEPTION 'Protocolo ativo não encontrado.' USING ERRCODE = 'P0002'; END IF;
      IF v_matches > 1 THEN RAISE EXCEPTION 'Há mais de um protocolo com esse nome; sincronização exige revisão.' USING ERRCODE = '21000'; END IF;
    END IF;

    PERFORM public.complete_livestock_protocol(
      v_protocol_id,
      COALESCE(NULLIF(v_payload->>'executed_on', '')::DATE, current_date),
      NULLIF(v_payload->>'quantity_treated', '')::INTEGER,
      COALESCE(NULLIF(v_payload->>'result_status', ''), 'completed'),
      NULLIF(btrim(v_payload->>'notes'), ''),
      NULLIF(v_payload->>'next_due_date', '')::DATE,
      p_actor_profile_id
    );

    UPDATE public.offline_commands SET
      status = 'processed', processed_at = clock_timestamp(),
      error_message = NULL, updated_at = clock_timestamp()
    WHERE id = p_command_id;
    RETURN QUERY SELECT true, NULL::TEXT, false;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.offline_commands SET
      status = 'failed', error_message = left(SQLERRM, 1_000), updated_at = clock_timestamp()
    WHERE id = p_command_id;
    RETURN QUERY SELECT false, left(SQLERRM, 1_000), false;
  END;
END;
$$;

CREATE TRIGGER set_updated_at_offline_commands BEFORE UPDATE ON public.offline_commands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_offline_commands AFTER INSERT OR UPDATE ON public.offline_commands
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER prevent_delete_offline_commands BEFORE DELETE ON public.offline_commands
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();

ALTER TABLE public.offline_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their offline commands"
  ON public.offline_commands FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.users_profiles AS profile
    WHERE profile.id = actor_profile_id
      AND profile.user_id = auth.uid()
      AND profile.is_active = true
  ));

REVOKE ALL ON public.offline_commands FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.offline_commands TO authenticated;
GRANT ALL ON public.offline_commands TO service_role;
REVOKE ALL ON FUNCTION public.process_offline_livestock_command(UUID, UUID, JSONB, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_offline_livestock_command(UUID, UUID, JSONB, TEXT, TIMESTAMPTZ)
  TO service_role;

COMMENT ON TABLE public.offline_commands IS
  'Fila auditável e idempotente dos comandos capturados sem conexão e sincronizados pelo aplicativo.';

COMMIT;

-- Offline 2.0: one immutable, idempotent gateway for real field operations.

BEGIN;

CREATE TABLE public.offline_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL UNIQUE,
  actor_profile_id UUID NOT NULL REFERENCES public.users_profiles(id) ON DELETE RESTRICT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_sync_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT offline_device_status_valid CHECK (status IN ('active', 'revoked')),
  CONSTRAINT offline_device_revocation_valid CHECK (
    (status = 'active' AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);
CREATE INDEX idx_offline_devices_actor_status ON public.offline_devices(actor_profile_id, status, last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.authorize_offline_device(
  p_device_id TEXT,
  p_actor_profile_id UUID,
  p_register BOOLEAN DEFAULT false,
  p_display_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_device_id UUID := public.try_uuid(p_device_id); v_device public.offline_devices%ROWTYPE;
BEGIN
  IF v_device_id IS NULL OR p_actor_profile_id IS NULL THEN RETURN false; END IF;
  IF p_register THEN
    INSERT INTO public.offline_devices (device_id, actor_profile_id, display_name)
    VALUES (v_device_id, p_actor_profile_id, NULLIF(left(btrim(p_display_name), 120), ''))
    ON CONFLICT (device_id) DO UPDATE SET
      display_name = COALESCE(public.offline_devices.display_name, EXCLUDED.display_name),
      last_seen_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE public.offline_devices.actor_profile_id = EXCLUDED.actor_profile_id;
  END IF;
  SELECT * INTO v_device FROM public.offline_devices WHERE device_id = v_device_id;
  IF NOT FOUND OR v_device.actor_profile_id <> p_actor_profile_id OR v_device.status <> 'active' THEN RETURN false; END IF;
  UPDATE public.offline_devices SET last_seen_at = clock_timestamp(), last_sync_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE device_id = v_device_id;
  RETURN true;
END;
$$;

ALTER TABLE public.offline_commands
  DROP CONSTRAINT offline_command_type_valid;
ALTER TABLE public.offline_commands
  ADD CONSTRAINT offline_command_type_valid CHECK (command_type IN (
    'complete_livestock_protocol',
    'create_task',
    'complete_task',
    'record_weighing',
    'record_cattle_movement',
    'record_inventory_movement',
    'create_expense'
  ));
ALTER TABLE public.offline_commands
  ADD COLUMN result_json JSONB;

CREATE OR REPLACE FUNCTION public.process_offline_field_command(
  p_command_id UUID,
  p_actor_profile_id UUID,
  p_command_type TEXT,
  p_payload JSONB,
  p_device_id TEXT DEFAULT NULL,
  p_client_created_at TIMESTAMPTZ DEFAULT clock_timestamp()
)
RETURNS TABLE (
  success BOOLEAN,
  error_message TEXT,
  already_processed BOOLEAN,
  record_id UUID
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_command public.offline_commands%ROWTYPE;
  v_payload JSONB;
  v_record_id UUID;
  v_farm_id UUID;
  v_lot_id UUID;
  v_pasture_id UUID;
  v_item_id UUID;
  v_task_id UUID;
  v_protocol_id UUID;
  v_name TEXT;
  v_matches INTEGER;
  v_quantity NUMERIC;
  v_current_quantity INTEGER;
  v_average NUMERIC;
  v_total NUMERIC;
  v_weight NUMERIC;
  v_weight_count INTEGER;
  v_weights JSONB;
  v_movement_type TEXT;
  v_from_pasture_id UUID;
BEGIN
  IF p_command_id IS NULL
    OR p_actor_profile_id IS NULL
    OR p_command_type NOT IN (
      'complete_livestock_protocol', 'create_task', 'complete_task',
      'record_weighing', 'record_cattle_movement',
      'record_inventory_movement', 'create_expense'
    )
    OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN QUERY SELECT false, 'Comando offline inválido.'::TEXT, false, NULL::UUID;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.offline_devices
    WHERE device_id = public.try_uuid(p_device_id)
      AND actor_profile_id = p_actor_profile_id
      AND status = 'active'
  ) THEN
    RETURN QUERY SELECT false, 'Este aparelho não está autorizado ou foi revogado. Conecte-se e atualize o pacote de campo.'::TEXT, false, NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO public.offline_commands (
    id, actor_profile_id, command_type, payload, device_id, client_created_at
  ) VALUES (
    p_command_id, p_actor_profile_id, p_command_type, p_payload,
    NULLIF(btrim(p_device_id), ''), p_client_created_at
  ) ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_command
  FROM public.offline_commands
  WHERE id = p_command_id
  FOR UPDATE;

  IF v_command.actor_profile_id <> p_actor_profile_id THEN
    RETURN QUERY SELECT false, 'O comando pertence a outro usuário.'::TEXT, false, NULL::UUID;
    RETURN;
  END IF;
  IF v_command.command_type <> p_command_type THEN
    RETURN QUERY SELECT false, 'O identificador já pertence a outro tipo de lançamento.'::TEXT, false, NULL::UUID;
    RETURN;
  END IF;
  IF v_command.status = 'processed' THEN
    RETURN QUERY SELECT true, NULL::TEXT, true, public.try_uuid(v_command.result_json->>'record_id');
    RETURN;
  END IF;

  -- The first payload is immutable. Retries cannot mutate a captured fact.
  v_payload := v_command.payload;
  UPDATE public.offline_commands SET
    status = 'processing', attempt_count = attempt_count + 1,
    error_message = NULL, updated_at = clock_timestamp()
  WHERE id = p_command_id;

  BEGIN
    SELECT id INTO v_farm_id
    FROM public.farms
    WHERE COALESCE(status, 'active') <> 'deleted'
    ORDER BY created_at, id
    LIMIT 1;

    CASE p_command_type
      WHEN 'complete_livestock_protocol' THEN
        v_protocol_id := public.try_uuid(v_payload->>'protocol_id');
        IF v_protocol_id IS NULL THEN
          v_name := NULLIF(btrim(v_payload->>'protocol_name'), '');
          SELECT count(*), min(id::TEXT)::UUID INTO v_matches, v_protocol_id
          FROM public.livestock_protocols
          WHERE lower(name) = lower(v_name) AND status = 'active';
          IF v_matches = 0 THEN RAISE EXCEPTION 'Protocolo ativo não encontrado.' USING ERRCODE = 'P0002'; END IF;
          IF v_matches > 1 THEN RAISE EXCEPTION 'Há protocolos repetidos com esse nome; revise o lançamento.' USING ERRCODE = '21000'; END IF;
        END IF;
        SELECT public.complete_livestock_protocol(
          v_protocol_id,
          COALESCE(NULLIF(v_payload->>'executed_on', '')::DATE, current_date),
          NULLIF(v_payload->>'quantity_treated', '')::INTEGER,
          COALESCE(NULLIF(v_payload->>'result_status', ''), 'completed'),
          NULLIF(btrim(v_payload->>'notes'), ''),
          NULLIF(v_payload->>'next_due_date', '')::DATE,
          p_actor_profile_id
        ) INTO v_record_id;

      WHEN 'create_task' THEN
        v_name := NULLIF(btrim(v_payload->>'title'), '');
        IF v_name IS NULL THEN RAISE EXCEPTION 'Título da tarefa é obrigatório.' USING ERRCODE = '22023'; END IF;
        IF COALESCE(v_payload->>'priority', 'medium') NOT IN ('low', 'medium', 'high') THEN
          RAISE EXCEPTION 'Prioridade inválida.' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.tasks (
          title, description, due_date, priority, task_type, related_farm_id,
          status, notes, source_message_id
        ) VALUES (
          v_name, NULLIF(btrim(v_payload->>'description'), ''),
          NULLIF(v_payload->>'due_date', '')::DATE,
          COALESCE(NULLIF(v_payload->>'priority', ''), 'medium'),
          'field_offline', v_farm_id, 'pending',
          NULLIF(btrim(v_payload->>'notes'), ''), 'offline:' || p_command_id::TEXT
        ) RETURNING id INTO v_record_id;

      WHEN 'complete_task' THEN
        v_task_id := public.try_uuid(v_payload->>'task_id');
        IF v_task_id IS NULL THEN
          v_name := NULLIF(btrim(v_payload->>'task_name'), '');
          SELECT count(*), min(id::TEXT)::UUID INTO v_matches, v_task_id
          FROM public.tasks
          WHERE lower(title) = lower(v_name) AND status IN ('pending', 'in_progress');
          IF v_matches = 0 THEN RAISE EXCEPTION 'Tarefa aberta não encontrada.' USING ERRCODE = 'P0002'; END IF;
          IF v_matches > 1 THEN RAISE EXCEPTION 'Há tarefas abertas repetidas; selecione a tarefa exata.' USING ERRCODE = '21000'; END IF;
        END IF;
        UPDATE public.tasks SET
          status = 'completed', completed_at = clock_timestamp(),
          notes = concat_ws(E'\n', NULLIF(notes, ''), NULLIF(btrim(v_payload->>'notes'), '')),
          updated_at = clock_timestamp()
        WHERE id = v_task_id AND status IN ('pending', 'in_progress')
        RETURNING id INTO v_record_id;
        IF v_record_id IS NULL THEN RAISE EXCEPTION 'A tarefa já foi concluída, cancelada ou removida.' USING ERRCODE = '40001'; END IF;

      WHEN 'record_weighing' THEN
        v_lot_id := public.try_uuid(v_payload->>'cattle_lot_id');
        IF v_lot_id IS NULL THEN
          v_name := NULLIF(btrim(v_payload->>'lot_name'), '');
          SELECT count(*), min(id::TEXT)::UUID INTO v_matches, v_lot_id
          FROM public.cattle_lots
          WHERE lower(name) = lower(v_name) AND COALESCE(status, 'active') <> 'deleted';
          IF v_matches = 0 THEN RAISE EXCEPTION 'Lote da pesagem não encontrado.' USING ERRCODE = 'P0002'; END IF;
          IF v_matches > 1 THEN RAISE EXCEPTION 'Há lotes repetidos com esse nome; selecione o lote exato.' USING ERRCODE = '21000'; END IF;
        END IF;
        PERFORM 1 FROM public.cattle_lots WHERE id = v_lot_id AND COALESCE(status, 'active') <> 'deleted' FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Lote da pesagem não encontrado.' USING ERRCODE = 'P0002'; END IF;

        v_weights := v_payload->'individual_weights';
        IF v_weights IS NOT NULL AND jsonb_typeof(v_weights) = 'array' AND jsonb_array_length(v_weights) > 0 THEN
          v_weight_count := 0; v_total := 0;
          FOR v_weight IN SELECT value::NUMERIC FROM jsonb_array_elements_text(v_weights) LOOP
            IF v_weight <= 0 OR v_weight > 2_000 THEN RAISE EXCEPTION 'A lista possui peso inválido.' USING ERRCODE = '22023'; END IF;
            v_weight_count := v_weight_count + 1; v_total := v_total + v_weight;
          END LOOP;
          IF v_weight_count > 2_000 THEN RAISE EXCEPTION 'A pesagem excede 2.000 registros.' USING ERRCODE = '54000'; END IF;
          v_quantity := v_weight_count; v_average := v_total / v_weight_count;
        ELSE
          v_weights := NULL;
          v_quantity := NULLIF(v_payload->>'quantity_weighed', '')::NUMERIC;
          v_average := NULLIF(v_payload->>'average_weight', '')::NUMERIC;
          v_total := NULLIF(v_payload->>'total_weight', '')::NUMERIC;
          IF v_average IS NULL AND v_total IS NOT NULL AND v_quantity > 0 THEN v_average := v_total / v_quantity; END IF;
          IF v_total IS NULL AND v_average IS NOT NULL AND v_quantity > 0 THEN v_total := v_average * v_quantity; END IF;
        END IF;
        IF v_average IS NULL OR v_average <= 0 OR v_average > 2_000 THEN
          RAISE EXCEPTION 'Informe o peso médio ou uma lista válida de pesos.' USING ERRCODE = '22023';
        END IF;
        IF v_quantity IS NOT NULL AND (v_quantity <= 0 OR v_quantity <> trunc(v_quantity)) THEN
          RAISE EXCEPTION 'Quantidade pesada deve ser inteira e positiva.' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.weighings (
          cattle_lot_id, weighing_date, quantity_weighed, average_weight,
          total_weight, individual_weights_json, notes, source_message_id, status
        ) VALUES (
          v_lot_id, COALESCE(NULLIF(v_payload->>'weighing_date', '')::DATE, current_date),
          v_quantity::INTEGER, round(v_average, 3), round(v_total, 3), v_weights,
          NULLIF(btrim(v_payload->>'notes'), ''), 'offline:' || p_command_id::TEXT, 'active'
        ) RETURNING id INTO v_record_id;

      WHEN 'record_cattle_movement' THEN
        v_movement_type := lower(NULLIF(btrim(v_payload->>'movement_type'), ''));
        v_quantity := NULLIF(v_payload->>'quantity', '')::NUMERIC;
        IF v_movement_type NOT IN ('birth', 'death', 'pasture_change')
          OR v_quantity IS NULL OR v_quantity <= 0 OR v_quantity <> trunc(v_quantity) THEN
          RAISE EXCEPTION 'Movimentação coletiva inválida.' USING ERRCODE = '22023';
        END IF;
        v_lot_id := public.try_uuid(v_payload->>'cattle_lot_id');
        SELECT current_quantity, pasture_id INTO v_current_quantity, v_from_pasture_id
        FROM public.cattle_lots
        WHERE id = v_lot_id AND COALESCE(status, 'active') <> 'deleted'
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Lote da movimentação não encontrado.' USING ERRCODE = 'P0002'; END IF;
        IF v_movement_type IN ('death', 'pasture_change') AND v_quantity > v_current_quantity THEN
          RAISE EXCEPTION 'O lote mudou enquanto o aparelho estava offline. Saldo atual: %; informado: %.', v_current_quantity, v_quantity USING ERRCODE = '40001';
        END IF;
        IF v_movement_type = 'pasture_change' THEN
          IF v_quantity <> v_current_quantity THEN
            RAISE EXCEPTION 'A troca de pasto exige o lote completo (% animais). Divida o lote antes de mover parcialmente.', v_current_quantity USING ERRCODE = '40001';
          END IF;
          v_pasture_id := public.try_uuid(v_payload->>'to_pasture_id');
          PERFORM 1 FROM public.pastures WHERE id = v_pasture_id AND COALESCE(status, 'active') <> 'deleted' FOR UPDATE;
          IF NOT FOUND THEN RAISE EXCEPTION 'Pasto de destino não encontrado.' USING ERRCODE = 'P0002'; END IF;
          IF v_pasture_id = v_from_pasture_id THEN RAISE EXCEPTION 'O lote já está nesse pasto.' USING ERRCODE = '40001'; END IF;
          UPDATE public.cattle_lots SET pasture_id = v_pasture_id, updated_at = clock_timestamp() WHERE id = v_lot_id;
        ELSIF v_movement_type = 'birth' THEN
          UPDATE public.cattle_lots SET current_quantity = current_quantity + v_quantity::INTEGER, updated_at = clock_timestamp() WHERE id = v_lot_id;
        ELSE
          UPDATE public.cattle_lots SET current_quantity = current_quantity - v_quantity::INTEGER, updated_at = clock_timestamp() WHERE id = v_lot_id;
        END IF;
        INSERT INTO public.cattle_movements (
          cattle_lot_id, movement_type, quantity, from_pasture_id, to_pasture_id,
          movement_date, reason, source_message_id, status, confirmed_by, confirmed_at
        ) VALUES (
          v_lot_id, v_movement_type, v_quantity::INTEGER, v_from_pasture_id, v_pasture_id,
          COALESCE(NULLIF(v_payload->>'movement_date', '')::DATE, current_date),
          NULLIF(btrim(v_payload->>'reason'), ''), 'offline:' || p_command_id::TEXT,
          'active', p_actor_profile_id, clock_timestamp()
        ) RETURNING id INTO v_record_id;

      WHEN 'record_inventory_movement' THEN
        v_item_id := public.try_uuid(v_payload->>'inventory_item_id');
        SELECT result.movement_id INTO v_record_id
        FROM public.register_inventory_movement(
          v_item_id,
          lower(NULLIF(btrim(v_payload->>'movement_type'), '')),
          NULLIF(v_payload->>'quantity', '')::NUMERIC,
          COALESCE(NULLIF(v_payload->>'movement_date', '')::DATE, current_date),
          NULLIF(btrim(v_payload->>'unit'), ''),
          NULLIF(btrim(v_payload->>'reason'), ''),
          'offline:' || p_command_id::TEXT,
          NULLIF(btrim(v_payload->>'notes'), '')
        ) AS result;

      WHEN 'create_expense' THEN
        v_quantity := NULLIF(v_payload->>'amount', '')::NUMERIC;
        v_name := NULLIF(btrim(v_payload->>'description'), '');
        IF v_quantity IS NULL OR v_quantity <= 0 OR v_name IS NULL THEN
          RAISE EXCEPTION 'Despesa exige descrição e valor positivo.' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.expenses (
          amount, description, category, expense_date, payment_method,
          supplier_name, related_farm_id, source_message_id, has_receipt, status
        ) VALUES (
          v_quantity, v_name, NULLIF(btrim(v_payload->>'category'), ''),
          COALESCE(NULLIF(v_payload->>'expense_date', '')::DATE, current_date),
          NULLIF(btrim(v_payload->>'payment_method'), ''),
          NULLIF(btrim(v_payload->>'supplier_name'), ''), v_farm_id,
          'offline:' || p_command_id::TEXT,
          COALESCE((v_payload->>'has_receipt')::BOOLEAN, false), 'active'
        ) RETURNING id INTO v_record_id;
    END CASE;

    UPDATE public.offline_commands SET
      status = 'processed', processed_at = clock_timestamp(), error_message = NULL,
      result_json = jsonb_build_object('record_id', v_record_id),
      updated_at = clock_timestamp()
    WHERE id = p_command_id;
    RETURN QUERY SELECT true, NULL::TEXT, false, v_record_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.offline_commands SET
      status = 'failed', error_message = left(SQLERRM, 1_000),
      updated_at = clock_timestamp()
    WHERE id = p_command_id;
    RETURN QUERY SELECT false, left(SQLERRM, 1_000), false, NULL::UUID;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.process_offline_field_command(UUID, UUID, TEXT, JSONB, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_offline_field_command(UUID, UUID, TEXT, JSONB, TEXT, TIMESTAMPTZ)
  TO service_role;
REVOKE ALL ON FUNCTION public.authorize_offline_device(TEXT, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_offline_device(TEXT, UUID, BOOLEAN, TEXT) TO service_role;

CREATE TRIGGER set_updated_at_offline_devices BEFORE UPDATE ON public.offline_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_offline_devices AFTER INSERT OR UPDATE ON public.offline_devices
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER prevent_delete_offline_devices BEFORE DELETE ON public.offline_devices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();
ALTER TABLE public.offline_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their offline devices" ON public.offline_devices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users_profiles profile WHERE profile.id = actor_profile_id AND profile.user_id = auth.uid()));
REVOKE ALL ON public.offline_devices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.offline_devices TO authenticated;
GRANT ALL ON public.offline_devices TO service_role;

COMMENT ON FUNCTION public.process_offline_field_command(UUID, UUID, TEXT, JSONB, TEXT, TIMESTAMPTZ) IS
  'Concilia comandos imutáveis do modo campo, recusando conflitos e duplicidades.';

COMMIT;

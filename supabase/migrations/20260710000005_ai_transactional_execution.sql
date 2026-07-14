-- Execute approved AI plans as a single, idempotent database transaction.
-- The pending action is claimed before any domain write; the inner exception
-- block rolls every domain step back while preserving a durable failed state.

BEGIN;

-- Kept idempotent because the following migration also exposes this relation
-- to the manual payroll workflow.
ALTER TABLE public.employee_payments
  ADD COLUMN IF NOT EXISTS related_expense_id UUID
  REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.execute_pending_action_transactional(
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
  v_pending public.pending_actions%ROWTYPE;
  v_expired public.pending_actions%ROWTYPE;
  v_step JSONB;
  v_payload JSONB;
  v_action_type TEXT;
  v_ordinal BIGINT;
  v_quantity NUMERIC;
  v_amount NUMERIC;
  v_average_weight NUMERIC;
  v_total_weight NUMERIC;
  v_current_quantity NUMERIC;
  v_lot_id UUID;
  v_pasture_id UUID;
  v_from_pasture_id UUID;
  v_employee_id UUID;
  v_expense_id UUID;
  v_movement_type TEXT;
  v_name TEXT;
  v_description TEXT;
  v_priority TEXT;
  v_error_message TEXT;
BEGIN
  IF p_action_id IS NULL THEN
    RETURN QUERY SELECT false, 'Ação pendente é obrigatória.'::TEXT;
    RETURN;
  END IF;

  -- Expiration and claim both use conditional writes, so concurrent approvals
  -- cannot execute the same pending action twice.
  UPDATE public.pending_actions AS pending
  SET confirmation_status = 'expired',
      updated_at = clock_timestamp()
  WHERE pending.id = p_action_id
    AND pending.confirmation_status = 'pending'
    AND pending.expires_at IS NOT NULL
    AND pending.expires_at <= clock_timestamp()
    AND (
      p_expected_source_message_id IS NULL
      OR pending.source_message_id = p_expected_source_message_id
    )
  RETURNING pending.* INTO v_expired;

  IF FOUND THEN
    INSERT INTO public.audit_logs (
      table_name,
      record_id,
      action,
      before_data_json,
      after_data_json,
      changed_by,
      reason,
      source_message_id
    ) VALUES (
      'pending_actions',
      v_expired.id,
      'expire_pending_action',
      jsonb_build_object('confirmation_status', 'pending'),
      jsonb_build_object('confirmation_status', 'expired'),
      NULL,
      'A ação expirou antes da aprovação.',
      v_expired.source_message_id
    );

    RETURN QUERY SELECT false, 'Ação expirada.'::TEXT;
    RETURN;
  END IF;

  UPDATE public.pending_actions AS pending
  SET confirmation_status = 'processing',
      updated_at = clock_timestamp()
  WHERE pending.id = p_action_id
    AND pending.confirmation_status = 'pending'
    AND (pending.expires_at IS NULL OR pending.expires_at > clock_timestamp())
    AND (
      p_expected_source_message_id IS NULL
      OR pending.source_message_id = p_expected_source_message_id
    )
  RETURNING pending.* INTO v_pending;

  IF NOT FOUND THEN
    -- Covers an expiration that happened between the first check and claim.
    UPDATE public.pending_actions AS pending
    SET confirmation_status = 'expired',
        updated_at = clock_timestamp()
    WHERE pending.id = p_action_id
      AND pending.confirmation_status = 'pending'
      AND pending.expires_at IS NOT NULL
      AND pending.expires_at <= clock_timestamp()
      AND (
        p_expected_source_message_id IS NULL
        OR pending.source_message_id = p_expected_source_message_id
      )
    RETURNING pending.* INTO v_expired;

    IF FOUND THEN
      INSERT INTO public.audit_logs (
        table_name,
        record_id,
        action,
        before_data_json,
        after_data_json,
        changed_by,
        reason,
        source_message_id
      ) VALUES (
        'pending_actions',
        v_expired.id,
        'expire_pending_action',
        jsonb_build_object('confirmation_status', 'pending'),
        jsonb_build_object('confirmation_status', 'expired'),
        NULL,
        'A ação expirou antes da aprovação.',
        v_expired.source_message_id
      );

      RETURN QUERY SELECT false, 'Ação expirada.'::TEXT;
      RETURN;
    END IF;

    RETURN QUERY SELECT false, 'Ação não encontrada, já processada ou vinculada a outra conversa.'::TEXT;
    RETURN;
  END IF;

  -- This block is a PL/pgSQL subtransaction. Any invalid primary or secondary
  -- step rolls back every domain mutation and the completed audit together.
  BEGIN
    IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' THEN
      RAISE EXCEPTION 'Plano de execução inválido.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_steps) = 0 THEN
      RAISE EXCEPTION 'Plano de execução vazio.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_steps) > 20 THEN
      RAISE EXCEPTION 'Plano de execução excede o limite de 20 ações.' USING ERRCODE = '22023';
    END IF;
    IF p_steps->0->>'action_type' IS DISTINCT FROM v_pending.action_type THEN
      RAISE EXCEPTION 'A ação primária não corresponde à ação pendente.' USING ERRCODE = '22023';
    END IF;

    FOR v_step, v_ordinal IN
      SELECT entry.value, entry.ordinality
      FROM jsonb_array_elements(p_steps) WITH ORDINALITY AS entry(value, ordinality)
    LOOP
      IF jsonb_typeof(v_step) <> 'object'
        OR jsonb_typeof(v_step->'payload') <> 'object' THEN
        RAISE EXCEPTION 'Etapa % do plano é inválida.', v_ordinal USING ERRCODE = '22023';
      END IF;

      v_action_type := NULLIF(btrim(v_step->>'action_type'), '');
      v_payload := v_step->'payload';
      IF v_action_type IS NULL THEN
        RAISE EXCEPTION 'Etapa % não informa o tipo de ação.', v_ordinal USING ERRCODE = '22023';
      END IF;

      CASE v_action_type
        WHEN 'create_expense' THEN
          v_amount := NULLIF(v_payload->>'amount', '')::NUMERIC;
          v_description := NULLIF(btrim(v_payload->>'description'), '');
          IF v_amount IS NULL OR v_amount <= 0 OR v_description IS NULL THEN
            RAISE EXCEPTION 'Despesa exige valor positivo e descrição.' USING ERRCODE = '22023';
          END IF;
          IF NULLIF(v_payload->>'expense_date', '') IS NULL THEN
            RAISE EXCEPTION 'Data da despesa é obrigatória.' USING ERRCODE = '22023';
          END IF;

          INSERT INTO public.expenses (
            amount,
            description,
            category,
            expense_date,
            source_message_id,
            status
          ) VALUES (
            v_amount,
            v_description,
            COALESCE(NULLIF(btrim(v_payload->>'category'), ''), 'IA'),
            (v_payload->>'expense_date')::DATE,
            v_pending.source_message_id,
            'active'
          );

        WHEN 'create_revenue' THEN
          v_amount := NULLIF(v_payload->>'amount', '')::NUMERIC;
          v_description := NULLIF(btrim(v_payload->>'description'), '');
          IF v_amount IS NULL OR v_amount <= 0 OR v_description IS NULL THEN
            RAISE EXCEPTION 'Receita exige valor positivo e descrição.' USING ERRCODE = '22023';
          END IF;
          IF NULLIF(v_payload->>'revenue_date', '') IS NULL THEN
            RAISE EXCEPTION 'Data da receita é obrigatória.' USING ERRCODE = '22023';
          END IF;

          INSERT INTO public.revenues (
            amount,
            description,
            category,
            revenue_date,
            source_message_id,
            status
          ) VALUES (
            v_amount,
            v_description,
            COALESCE(NULLIF(btrim(v_payload->>'category'), ''), 'IA'),
            (v_payload->>'revenue_date')::DATE,
            v_pending.source_message_id,
            'active'
          );

        WHEN 'create_task' THEN
          v_name := NULLIF(btrim(v_payload->>'title'), '');
          v_priority := COALESCE(NULLIF(btrim(v_payload->>'priority'), ''), 'medium');
          IF v_name IS NULL THEN
            RAISE EXCEPTION 'Título da tarefa é obrigatório.' USING ERRCODE = '22023';
          END IF;
          IF v_priority NOT IN ('low', 'medium', 'high') THEN
            RAISE EXCEPTION 'Prioridade da tarefa é inválida.' USING ERRCODE = '22023';
          END IF;

          INSERT INTO public.tasks (
            title,
            description,
            priority,
            due_date,
            source_message_id,
            status
          ) VALUES (
            v_name,
            NULLIF(btrim(v_payload->>'description'), ''),
            v_priority,
            CASE
              WHEN NULLIF(v_payload->>'due_date', '') IS NULL THEN NULL
              ELSE (v_payload->>'due_date')::DATE
            END,
            v_pending.source_message_id,
            'pending'
          );

        WHEN 'create_cattle_lot' THEN
          v_name := NULLIF(btrim(v_payload->>'name'), '');
          v_quantity := NULLIF(v_payload->>'current_quantity', '')::NUMERIC;
          IF v_name IS NULL
            OR v_quantity IS NULL
            OR v_quantity <= 0
            OR v_quantity <> trunc(v_quantity) THEN
            RAISE EXCEPTION 'Lote exige nome e quantidade inteira positiva.' USING ERRCODE = '22023';
          END IF;

          INSERT INTO public.cattle_lots (
            name,
            category,
            current_quantity,
            origin,
            status
          ) VALUES (
            v_name,
            NULLIF(btrim(v_payload->>'category'), ''),
            v_quantity::INTEGER,
            NULLIF(btrim(v_payload->>'origin'), ''),
            'active'
          );

        WHEN 'record_inventory_entry' THEN
          v_name := NULLIF(btrim(v_payload->>'item_name'), '');
          v_quantity := NULLIF(v_payload->>'quantity', '')::NUMERIC;
          IF v_name IS NULL
            OR NULLIF(btrim(v_payload->>'unit'), '') IS NULL
            OR v_quantity IS NULL
            OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'Entrada de estoque exige item, unidade e quantidade positiva.' USING ERRCODE = '22023';
          END IF;
          IF NULLIF(v_payload->>'movement_date', '') IS NULL THEN
            RAISE EXCEPTION 'Data da entrada de estoque é obrigatória.' USING ERRCODE = '22023';
          END IF;

          PERFORM 1
          FROM public.record_inventory_entry_by_name(
            v_name,
            v_quantity,
            btrim(v_payload->>'unit'),
            (v_payload->>'movement_date')::DATE,
            NULLIF(btrim(v_payload->>'category'), ''),
            NULLIF(btrim(v_payload->>'reason'), ''),
            v_pending.source_message_id
          );

        WHEN 'record_cattle_sale' THEN
          v_lot_id := NULLIF(v_payload->>'cattle_lot_id', '')::UUID;
          v_quantity := NULLIF(v_payload->>'quantity', '')::NUMERIC;
          v_amount := NULLIF(v_payload->>'gross_amount', '')::NUMERIC;
          v_name := NULLIF(btrim(v_payload->>'buyer_name'), '');
          IF v_lot_id IS NULL
            OR v_quantity IS NULL
            OR v_quantity <= 0
            OR v_quantity <> trunc(v_quantity)
            OR v_amount IS NULL
            OR v_amount <= 0
            OR v_name IS NULL THEN
            RAISE EXCEPTION 'Venda exige lote, comprador, quantidade inteira positiva e valor positivo.' USING ERRCODE = '22023';
          END IF;
          IF NULLIF(v_payload->>'negotiation_date', '') IS NULL THEN
            RAISE EXCEPTION 'Data da negociação é obrigatória.' USING ERRCODE = '22023';
          END IF;

          SELECT COALESCE(lot.current_quantity, 0)
          INTO v_current_quantity
          FROM public.cattle_lots AS lot
          WHERE lot.id = v_lot_id
            AND COALESCE(lot.status, 'active') <> 'deleted'
          FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'Lote da venda não encontrado ou excluído.' USING ERRCODE = 'P0002';
          END IF;
          IF v_quantity > v_current_quantity THEN
            RAISE EXCEPTION 'Saldo insuficiente no lote. Disponível: %, venda: %.', v_current_quantity, v_quantity
              USING ERRCODE = '23514';
          END IF;

          UPDATE public.cattle_lots
          SET current_quantity = COALESCE(current_quantity, 0) - v_quantity::INTEGER,
              updated_at = clock_timestamp()
          WHERE id = v_lot_id;

          INSERT INTO public.cattle_sales (
            buyer_name,
            cattle_lot_id,
            quantity,
            negotiation_date,
            shipment_date,
            gross_amount,
            payment_status,
            status
          ) VALUES (
            v_name,
            v_lot_id,
            v_quantity::INTEGER,
            (v_payload->>'negotiation_date')::DATE,
            CASE
              WHEN NULLIF(v_payload->>'shipment_date', '') IS NULL THEN NULL
              ELSE (v_payload->>'shipment_date')::DATE
            END,
            v_amount,
            'pending',
            'active'
          );

        WHEN 'record_cattle_movement' THEN
          v_pasture_id := NULL;
          v_from_pasture_id := NULL;
          v_movement_type := NULLIF(lower(btrim(v_payload->>'movement_type')), '');
          v_quantity := NULLIF(v_payload->>'quantity', '')::NUMERIC;
          IF v_movement_type IS NULL
            OR v_movement_type NOT IN ('purchase', 'birth', 'death', 'pasture_change')
            OR v_quantity IS NULL
            OR v_quantity <= 0
            OR v_quantity <> trunc(v_quantity) THEN
            RAISE EXCEPTION 'Movimentação exige tipo válido e quantidade inteira positiva.' USING ERRCODE = '22023';
          END IF;
          IF NULLIF(v_payload->>'movement_date', '') IS NULL THEN
            RAISE EXCEPTION 'Data da movimentação é obrigatória.' USING ERRCODE = '22023';
          END IF;

          IF v_movement_type = 'purchase' THEN
            v_name := NULLIF(btrim(v_payload->>'lot_name'), '');
            IF v_name IS NULL THEN
              RAISE EXCEPTION 'Nome do novo lote é obrigatório para compra.' USING ERRCODE = '22023';
            END IF;

            INSERT INTO public.cattle_lots (
              name,
              category,
              current_quantity,
              origin,
              status
            ) VALUES (
              v_name,
              NULLIF(btrim(v_payload->>'animal_category'), ''),
              v_quantity::INTEGER,
              COALESCE(NULLIF(btrim(v_payload->>'origin'), ''), 'Compra via IA'),
              'active'
            )
            RETURNING id INTO v_lot_id;
          ELSE
            v_lot_id := NULLIF(v_payload->>'cattle_lot_id', '')::UUID;
            IF v_lot_id IS NULL THEN
              RAISE EXCEPTION 'Lote é obrigatório para esta movimentação.' USING ERRCODE = '22023';
            END IF;

            SELECT COALESCE(lot.current_quantity, 0), lot.pasture_id
            INTO v_current_quantity, v_from_pasture_id
            FROM public.cattle_lots AS lot
            WHERE lot.id = v_lot_id
              AND COALESCE(lot.status, 'active') <> 'deleted'
            FOR UPDATE;

            IF NOT FOUND THEN
              RAISE EXCEPTION 'Lote da movimentação não encontrado ou excluído.' USING ERRCODE = 'P0002';
            END IF;

            IF v_movement_type IN ('death', 'pasture_change')
              AND v_quantity > v_current_quantity THEN
              RAISE EXCEPTION 'Quantidade excede o saldo do lote. Disponível: %, informado: %.', v_current_quantity, v_quantity
                USING ERRCODE = '23514';
            END IF;
            IF v_movement_type = 'pasture_change'
              AND v_quantity <> v_current_quantity THEN
              RAISE EXCEPTION 'A troca de pasto deve mover todo o lote (% animais). Para mover apenas %, divida ou crie outro lote.', v_current_quantity, v_quantity
                USING ERRCODE = '22023';
            END IF;

            IF v_movement_type = 'pasture_change' THEN
              v_pasture_id := NULLIF(v_payload->>'to_pasture_id', '')::UUID;
              IF v_pasture_id IS NULL THEN
                RAISE EXCEPTION 'Pasto de destino é obrigatório para a transferência.' USING ERRCODE = '22023';
              END IF;

              PERFORM 1
              FROM public.pastures AS pasture
              WHERE pasture.id = v_pasture_id
                AND COALESCE(pasture.status, 'active') <> 'deleted'
              FOR UPDATE;

              IF NOT FOUND THEN
                RAISE EXCEPTION 'Pasto de destino não encontrado ou excluído.' USING ERRCODE = 'P0002';
              END IF;
              IF v_from_pasture_id = v_pasture_id THEN
                RAISE EXCEPTION 'O lote já está no pasto de destino.' USING ERRCODE = '22023';
              END IF;
            END IF;

            IF v_movement_type = 'birth' THEN
              UPDATE public.cattle_lots
              SET current_quantity = COALESCE(current_quantity, 0) + v_quantity::INTEGER,
                  updated_at = clock_timestamp()
              WHERE id = v_lot_id;
            ELSIF v_movement_type = 'death' THEN
              UPDATE public.cattle_lots
              SET current_quantity = COALESCE(current_quantity, 0) - v_quantity::INTEGER,
                  updated_at = clock_timestamp()
              WHERE id = v_lot_id;
            ELSIF v_movement_type = 'pasture_change' THEN
              UPDATE public.cattle_lots
              SET pasture_id = v_pasture_id,
                  updated_at = clock_timestamp()
              WHERE id = v_lot_id;
            END IF;
          END IF;

          INSERT INTO public.cattle_movements (
            cattle_lot_id,
            movement_type,
            quantity,
            from_pasture_id,
            to_pasture_id,
            movement_date,
            reason,
            requires_confirmation,
            confirmed_by,
            confirmed_at,
            source_message_id,
            notes,
            status
          ) VALUES (
            v_lot_id,
            v_movement_type,
            v_quantity::INTEGER,
            CASE WHEN v_movement_type = 'pasture_change' THEN v_from_pasture_id ELSE NULL END,
            CASE WHEN v_movement_type = 'pasture_change' THEN v_pasture_id ELSE NULL END,
            (v_payload->>'movement_date')::DATE,
            NULLIF(btrim(v_payload->>'reason'), ''),
            false,
            p_actor_profile_id,
            clock_timestamp(),
            v_pending.source_message_id,
            'Registrado via IA',
            'active'
          );

        WHEN 'record_weighing' THEN
          v_lot_id := NULLIF(v_payload->>'cattle_lot_id', '')::UUID;
          v_average_weight := NULLIF(v_payload->>'average_weight', '')::NUMERIC;
          v_quantity := NULLIF(v_payload->>'quantity_weighed', '')::NUMERIC;
          v_total_weight := NULLIF(v_payload->>'total_weight', '')::NUMERIC;
          IF v_lot_id IS NULL OR v_average_weight IS NULL OR v_average_weight <= 0 THEN
            RAISE EXCEPTION 'Pesagem exige lote e peso médio positivo.' USING ERRCODE = '22023';
          END IF;
          IF v_quantity IS NOT NULL
            AND (v_quantity <= 0 OR v_quantity <> trunc(v_quantity)) THEN
            RAISE EXCEPTION 'Quantidade pesada deve ser inteira e positiva.' USING ERRCODE = '22023';
          END IF;
          IF v_total_weight IS NOT NULL AND v_total_weight <= 0 THEN
            RAISE EXCEPTION 'Peso total deve ser positivo.' USING ERRCODE = '22023';
          END IF;
          IF NULLIF(v_payload->>'weighing_date', '') IS NULL THEN
            RAISE EXCEPTION 'Data da pesagem é obrigatória.' USING ERRCODE = '22023';
          END IF;

          SELECT COALESCE(lot.current_quantity, 0)
          INTO v_current_quantity
          FROM public.cattle_lots AS lot
          WHERE lot.id = v_lot_id
            AND COALESCE(lot.status, 'active') <> 'deleted'
          FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'Lote da pesagem não encontrado ou excluído.' USING ERRCODE = 'P0002';
          END IF;
          IF v_quantity IS NOT NULL AND v_quantity > v_current_quantity THEN
            RAISE EXCEPTION 'Quantidade pesada excede o saldo do lote.' USING ERRCODE = '23514';
          END IF;

          INSERT INTO public.weighings (
            cattle_lot_id,
            weighing_date,
            quantity_weighed,
            average_weight,
            total_weight,
            notes,
            source_message_id,
            status
          ) VALUES (
            v_lot_id,
            (v_payload->>'weighing_date')::DATE,
            CASE WHEN v_quantity IS NULL THEN NULL ELSE v_quantity::INTEGER END,
            v_average_weight,
            COALESCE(v_total_weight, v_average_weight * v_quantity),
            COALESCE(NULLIF(btrim(v_payload->>'notes'), ''), 'Registrado via IA'),
            v_pending.source_message_id,
            'active'
          );

        WHEN 'record_employee_payment' THEN
          v_employee_id := NULLIF(v_payload->>'employee_id', '')::UUID;
          v_amount := NULLIF(v_payload->>'amount', '')::NUMERIC;
          v_name := NULLIF(btrim(v_payload->>'payment_type'), '');
          IF v_employee_id IS NULL OR v_amount IS NULL OR v_amount <= 0 OR v_name IS NULL THEN
            RAISE EXCEPTION 'Pagamento exige funcionário, tipo e valor positivo.' USING ERRCODE = '22023';
          END IF;
          IF NULLIF(v_payload->>'payment_date', '') IS NULL THEN
            RAISE EXCEPTION 'Data do pagamento é obrigatória.' USING ERRCODE = '22023';
          END IF;

          PERFORM 1
          FROM public.employees AS employee
          WHERE employee.id = v_employee_id
            AND COALESCE(employee.status, 'active') <> 'deleted'
          FOR UPDATE;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'Funcionário não encontrado ou excluído.' USING ERRCODE = 'P0002';
          END IF;

          v_description := COALESCE(
            NULLIF(btrim(v_payload->>'description'), ''),
            v_name || ' via IA'
          );

          INSERT INTO public.expenses (
            category,
            description,
            amount,
            expense_date,
            related_employee_id,
            source_message_id,
            status
          ) VALUES (
            'Folha de Pagamento',
            v_description,
            v_amount,
            (v_payload->>'payment_date')::DATE,
            v_employee_id,
            v_pending.source_message_id,
            'active'
          )
          RETURNING id INTO v_expense_id;

          INSERT INTO public.employee_payments (
            employee_id,
            related_expense_id,
            payment_type,
            amount,
            payment_date,
            description,
            requires_confirmation,
            confirmed_by,
            confirmed_at,
            source_message_id,
            status
          ) VALUES (
            v_employee_id,
            v_expense_id,
            v_name,
            v_amount,
            (v_payload->>'payment_date')::DATE,
            v_description,
            false,
            p_actor_profile_id,
            clock_timestamp(),
            v_pending.source_message_id,
            'active'
          );

        ELSE
          RAISE EXCEPTION 'A ação % não é suportada.', v_action_type USING ERRCODE = '22023';
      END CASE;
    END LOOP;

    UPDATE public.pending_actions AS pending
    SET confirmation_status = 'completed',
        confirmed_by = p_actor_profile_id,
        confirmed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE pending.id = v_pending.id
      AND pending.confirmation_status = 'processing';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A ação perdeu o estado de processamento.' USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.audit_logs (
      table_name,
      record_id,
      action,
      before_data_json,
      after_data_json,
      changed_by,
      reason,
      source_message_id
    ) VALUES (
      'pending_actions',
      v_pending.id,
      'approve_pending_action',
      jsonb_build_object('confirmation_status', 'pending'),
      jsonb_build_object(
        'confirmation_status', 'completed',
        'action_type', v_pending.action_type,
        'steps', p_steps
      ),
      p_actor_profile_id,
      COALESCE(NULLIF(btrim(p_reason), ''), 'Aprovada e executada pela IA.'),
      v_pending.source_message_id
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_error_message := left(SQLERRM, 1000);

      UPDATE public.pending_actions AS pending
      SET confirmation_status = 'failed',
          confirmed_by = NULL,
          confirmed_at = NULL,
          updated_at = clock_timestamp()
      WHERE pending.id = v_pending.id
        AND pending.confirmation_status = 'processing';

      INSERT INTO public.audit_logs (
        table_name,
        record_id,
        action,
        before_data_json,
        after_data_json,
        changed_by,
        reason,
        source_message_id
      ) VALUES (
        'pending_actions',
        v_pending.id,
        'execute_pending_action_failed',
        jsonb_build_object('confirmation_status', 'processing'),
        jsonb_build_object(
          'confirmation_status', 'failed',
          'error', v_error_message,
          'steps', p_steps
        ),
        NULL,
        v_error_message,
        v_pending.source_message_id
      );

      RETURN QUERY SELECT false, v_error_message;
      RETURN;
  END;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_pending_action_validation(
  p_action_id UUID,
  p_expected_source_message_id TEXT,
  p_error_message TEXT
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending public.pending_actions%ROWTYPE;
BEGIN
  IF p_action_id IS NULL THEN
    RETURN QUERY SELECT false, 'Ação pendente é obrigatória.'::TEXT;
    RETURN;
  END IF;

  UPDATE public.pending_actions AS pending
  SET confirmation_status = 'expired',
      updated_at = clock_timestamp()
  WHERE pending.id = p_action_id
    AND pending.confirmation_status = 'pending'
    AND pending.expires_at IS NOT NULL
    AND pending.expires_at <= clock_timestamp()
    AND (
      p_expected_source_message_id IS NULL
      OR pending.source_message_id = p_expected_source_message_id
    )
  RETURNING pending.* INTO v_pending;

  IF FOUND THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, before_data_json, after_data_json,
      changed_by, reason, source_message_id
    ) VALUES (
      'pending_actions', v_pending.id, 'expire_pending_action',
      jsonb_build_object('confirmation_status', 'pending'),
      jsonb_build_object('confirmation_status', 'expired'),
      NULL, 'A ação expirou antes da validação.', v_pending.source_message_id
    );

    RETURN QUERY SELECT false, 'Ação expirada.'::TEXT;
    RETURN;
  END IF;

  UPDATE public.pending_actions AS pending
  SET confirmation_status = 'failed',
      updated_at = clock_timestamp()
  WHERE pending.id = p_action_id
    AND pending.confirmation_status = 'pending'
    AND (pending.expires_at IS NULL OR pending.expires_at > clock_timestamp())
    AND (
      p_expected_source_message_id IS NULL
      OR pending.source_message_id = p_expected_source_message_id
    )
  RETURNING pending.* INTO v_pending;

  IF NOT FOUND THEN
    -- Covers an expiration that happened between the first check and update.
    UPDATE public.pending_actions AS pending
    SET confirmation_status = 'expired',
        updated_at = clock_timestamp()
    WHERE pending.id = p_action_id
      AND pending.confirmation_status = 'pending'
      AND pending.expires_at IS NOT NULL
      AND pending.expires_at <= clock_timestamp()
      AND (
        p_expected_source_message_id IS NULL
        OR pending.source_message_id = p_expected_source_message_id
      )
    RETURNING pending.* INTO v_pending;

    IF FOUND THEN
      INSERT INTO public.audit_logs (
        table_name, record_id, action, before_data_json, after_data_json,
        changed_by, reason, source_message_id
      ) VALUES (
        'pending_actions', v_pending.id, 'expire_pending_action',
        jsonb_build_object('confirmation_status', 'pending'),
        jsonb_build_object('confirmation_status', 'expired'),
        NULL, 'A ação expirou antes da validação.', v_pending.source_message_id
      );

      RETURN QUERY SELECT false, 'Ação expirada.'::TEXT;
      RETURN;
    END IF;

    RETURN QUERY SELECT false, 'Ação não encontrada, já processada ou vinculada a outra conversa.'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (
    table_name, record_id, action, before_data_json, after_data_json,
    changed_by, reason, source_message_id
  ) VALUES (
    'pending_actions', v_pending.id, 'fail_pending_action_validation',
    jsonb_build_object('confirmation_status', 'pending'),
    jsonb_build_object(
      'confirmation_status', 'failed',
      'error', left(COALESCE(NULLIF(btrim(p_error_message), ''), 'Plano de execução inválido.'), 1000)
    ),
    NULL,
    left(COALESCE(NULLIF(btrim(p_error_message), ''), 'Plano de execução inválido.'), 1000),
    v_pending.source_message_id
  );

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_pending_action_transactional(
  p_action_id UUID,
  p_expected_source_message_id TEXT,
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
BEGIN
  IF p_action_id IS NULL THEN
    RETURN QUERY SELECT false, 'Ação pendente é obrigatória.'::TEXT;
    RETURN;
  END IF;

  UPDATE public.pending_actions AS pending
  SET confirmation_status = 'expired',
      updated_at = clock_timestamp()
  WHERE pending.id = p_action_id
    AND pending.confirmation_status = 'pending'
    AND pending.expires_at IS NOT NULL
    AND pending.expires_at <= clock_timestamp()
    AND (
      p_expected_source_message_id IS NULL
      OR pending.source_message_id = p_expected_source_message_id
    )
  RETURNING pending.* INTO v_pending;

  IF FOUND THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, before_data_json, after_data_json,
      changed_by, reason, source_message_id
    ) VALUES (
      'pending_actions', v_pending.id, 'expire_pending_action',
      jsonb_build_object('confirmation_status', 'pending'),
      jsonb_build_object('confirmation_status', 'expired'),
      NULL, 'A ação expirou antes da rejeição.', v_pending.source_message_id
    );

    RETURN QUERY SELECT false, 'Ação expirada.'::TEXT;
    RETURN;
  END IF;

  UPDATE public.pending_actions AS pending
  SET confirmation_status = 'discarded',
      confirmed_by = p_actor_profile_id,
      confirmed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE pending.id = p_action_id
    AND pending.confirmation_status = 'pending'
    AND (pending.expires_at IS NULL OR pending.expires_at > clock_timestamp())
    AND (
      p_expected_source_message_id IS NULL
      OR pending.source_message_id = p_expected_source_message_id
    )
  RETURNING pending.* INTO v_pending;

  IF NOT FOUND THEN
    -- Covers an expiration that happened between the first check and update.
    UPDATE public.pending_actions AS pending
    SET confirmation_status = 'expired',
        confirmed_by = NULL,
        confirmed_at = NULL,
        updated_at = clock_timestamp()
    WHERE pending.id = p_action_id
      AND pending.confirmation_status = 'pending'
      AND pending.expires_at IS NOT NULL
      AND pending.expires_at <= clock_timestamp()
      AND (
        p_expected_source_message_id IS NULL
        OR pending.source_message_id = p_expected_source_message_id
      )
    RETURNING pending.* INTO v_pending;

    IF FOUND THEN
      INSERT INTO public.audit_logs (
        table_name, record_id, action, before_data_json, after_data_json,
        changed_by, reason, source_message_id
      ) VALUES (
        'pending_actions', v_pending.id, 'expire_pending_action',
        jsonb_build_object('confirmation_status', 'pending'),
        jsonb_build_object('confirmation_status', 'expired'),
        NULL, 'A ação expirou antes da rejeição.', v_pending.source_message_id
      );

      RETURN QUERY SELECT false, 'Ação expirada.'::TEXT;
      RETURN;
    END IF;

    RETURN QUERY SELECT false, 'Ação não encontrada, já processada ou vinculada a outra conversa.'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (
    table_name, record_id, action, before_data_json, after_data_json,
    changed_by, reason, source_message_id
  ) VALUES (
    'pending_actions', v_pending.id, 'reject_pending_action',
    jsonb_build_object('confirmation_status', 'pending'),
    jsonb_build_object('confirmation_status', 'discarded'),
    p_actor_profile_id,
    COALESCE(NULLIF(btrim(p_reason), ''), 'Rejeitada pelo usuário.'),
    v_pending.source_message_id
  );

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_pending_action_transactional(UUID, TEXT, JSONB, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_pending_action_validation(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_pending_action_transactional(UUID, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.execute_pending_action_transactional(UUID, TEXT, JSONB, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_pending_action_validation(UUID, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_pending_action_transactional(UUID, TEXT, UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.execute_pending_action_transactional(UUID, TEXT, JSONB, UUID, TEXT)
  IS 'Reivindica uma ação pendente e executa o plano primário/secundário em uma única subtransação, com rollback integral e auditoria.';
COMMENT ON FUNCTION public.fail_pending_action_validation(UUID, TEXT, TEXT)
  IS 'Falha de forma atômica uma ação pendente cujo plano legado não passou na validação.';
COMMENT ON FUNCTION public.reject_pending_action_transactional(UUID, TEXT, UUID, TEXT)
  IS 'Rejeita ou expira uma ação pendente de forma atômica e registra auditoria.';

COMMIT;

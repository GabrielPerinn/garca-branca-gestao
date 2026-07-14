-- Keep occurrence conversion and payroll/finance writes consistent.

BEGIN;

ALTER TABLE public.employee_payments
  ADD COLUMN IF NOT EXISTS related_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employee_payments_related_expense
  ON public.employee_payments (related_expense_id)
  WHERE related_expense_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_employee_payment_transactional(
  p_employee_id UUID,
  p_payment_type TEXT,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (payment_id UUID, expense_id UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_name TEXT;
  v_expense_id UUID;
  v_payment_id UUID;
  v_description TEXT;
BEGIN
  IF p_employee_id IS NULL OR p_payment_type IS NULL OR btrim(p_payment_type) = '' THEN
    RAISE EXCEPTION 'Funcionário e tipo de pagamento são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Valor positivo e data são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  SELECT employee.full_name
  INTO v_employee_name
  FROM public.employees AS employee
  WHERE employee.id = p_employee_id
    AND COALESCE(employee.status, 'active') <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado ou excluído.' USING ERRCODE = 'P0002';
  END IF;

  v_description := COALESCE(
    NULLIF(btrim(p_description), ''),
    initcap(btrim(p_payment_type)) || ' — ' || v_employee_name
  );

  INSERT INTO public.expenses (
    category, description, amount, expense_date, related_employee_id, status
  ) VALUES (
    'Folha de Pagamento', v_description, p_amount, p_payment_date, p_employee_id, 'active'
  )
  RETURNING id INTO v_expense_id;

  INSERT INTO public.employee_payments (
    employee_id, payment_type, amount, payment_date, description, related_expense_id, status
  ) VALUES (
    p_employee_id, btrim(p_payment_type), p_amount, p_payment_date,
    v_description, v_expense_id, 'active'
  )
  RETURNING id INTO v_payment_id;

  RETURN QUERY SELECT v_payment_id, v_expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_employee_payment_transactional(
  p_payment_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expense_id UUID;
BEGIN
  SELECT payment.related_expense_id
  INTO v_expense_id
  FROM public.employee_payments AS payment
  WHERE payment.id = p_payment_id
    AND COALESCE(payment.status, 'active') <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado ou já excluído.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.employee_payments
  SET status = 'deleted', updated_at = now()
  WHERE id = p_payment_id;

  IF v_expense_id IS NOT NULL THEN
    UPDATE public.expenses
    SET status = 'deleted', updated_at = now()
    WHERE id = v_expense_id
      AND COALESCE(status, 'active') <> 'deleted';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_occurrence_transactional(
  p_occurrence_id UUID,
  p_target_table TEXT,
  p_payload JSONB
)
RETURNS TABLE (success BOOLEAN, error_message TEXT, converted_record_id UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claimed_id UUID;
  v_record_id UUID;
  v_error TEXT;
BEGIN
  UPDATE public.occurrences
  SET status = 'converting', updated_at = now()
  WHERE id = p_occurrence_id
    AND status = 'pending_review'
  RETURNING id INTO v_claimed_id;

  IF v_claimed_id IS NULL THEN
    RETURN QUERY SELECT false, 'Ocorrência não encontrada ou já processada.'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  BEGIN
    CASE p_target_table
      WHEN 'tasks' THEN
        INSERT INTO public.tasks (title, description, priority, status)
        VALUES (
          btrim(p_payload->>'title'),
          NULLIF(btrim(p_payload->>'description'), ''),
          COALESCE(NULLIF(btrim(p_payload->>'priority'), ''), 'medium'),
          'pending'
        )
        RETURNING id INTO v_record_id;
      WHEN 'expenses' THEN
        INSERT INTO public.expenses (description, amount, expense_date, category, status)
        VALUES (
          btrim(p_payload->>'description'),
          (p_payload->>'amount')::NUMERIC,
          (p_payload->>'expense_date')::DATE,
          COALESCE(NULLIF(btrim(p_payload->>'category'), ''), 'Ocorrência'),
          'active'
        )
        RETURNING id INTO v_record_id;
      WHEN 'maintenance_records' THEN
        INSERT INTO public.maintenance_records (asset_name, notes, maintenance_date, status)
        VALUES (
          btrim(p_payload->>'asset_name'),
          NULLIF(btrim(p_payload->>'notes'), ''),
          NULLIF(p_payload->>'maintenance_date', '')::DATE,
          'active'
        )
        RETURNING id INTO v_record_id;
      ELSE
        RAISE EXCEPTION 'Destino de conversão inválido.' USING ERRCODE = '22023';
    END CASE;

    UPDATE public.occurrences
    SET status = 'converted',
        converted_to_table = p_target_table,
        converted_to_id = v_record_id,
        updated_at = now()
    WHERE id = v_claimed_id
      AND status = 'converting';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A ocorrência perdeu a reivindicação durante a conversão.';
    END IF;

    RETURN QUERY SELECT true, NULL::TEXT, v_record_id;
    RETURN;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    UPDATE public.occurrences
    SET status = 'pending_review', updated_at = now()
    WHERE id = v_claimed_id
      AND status = 'converting';
    RETURN QUERY SELECT false, v_error, NULL::UUID;
    RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_employee_payment_transactional(UUID, TEXT, NUMERIC, DATE, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revert_employee_payment_transactional(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convert_occurrence_transactional(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_employee_payment_transactional(UUID, TEXT, NUMERIC, DATE, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revert_employee_payment_transactional(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_occurrence_transactional(UUID, TEXT, JSONB) TO service_role;

COMMIT;

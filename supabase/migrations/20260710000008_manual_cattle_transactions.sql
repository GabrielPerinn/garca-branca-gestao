-- Keep manual sales/weighings aligned with cattle lot balances.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_cattle_sale_transactional(
  p_cattle_lot_id UUID,
  p_buyer_name TEXT,
  p_quantity INTEGER,
  p_gross_amount NUMERIC,
  p_negotiation_date DATE,
  p_shipment_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_available INTEGER;
  v_sale_id UUID;
BEGIN
  IF p_cattle_lot_id IS NULL OR p_buyer_name IS NULL OR btrim(p_buyer_name) = '' THEN
    RAISE EXCEPTION 'Lote e comprador são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
    RAISE EXCEPTION 'Quantidade e valor devem ser positivos.' USING ERRCODE = '22023';
  END IF;
  IF p_negotiation_date IS NULL THEN
    RAISE EXCEPTION 'Data da negociação é obrigatória.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(lot.current_quantity, 0)
  INTO v_available
  FROM public.cattle_lots AS lot
  WHERE lot.id = p_cattle_lot_id
    AND COALESCE(lot.status, 'active') <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado ou excluído.' USING ERRCODE = 'P0002';
  END IF;
  IF p_quantity > v_available THEN
    RAISE EXCEPTION 'Saldo insuficiente no lote. Disponível: %, venda: %.', v_available, p_quantity
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.cattle_lots
  SET current_quantity = COALESCE(current_quantity, 0) - p_quantity,
      updated_at = now()
  WHERE id = p_cattle_lot_id;

  INSERT INTO public.cattle_sales (
    buyer_name, cattle_lot_id, quantity, negotiation_date, shipment_date,
    gross_amount, notes, payment_status, status
  ) VALUES (
    btrim(p_buyer_name), p_cattle_lot_id, p_quantity, p_negotiation_date,
    p_shipment_date, p_gross_amount, NULLIF(btrim(p_notes), ''), 'pending', 'active'
  )
  RETURNING id INTO v_sale_id;

  RETURN v_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_cattle_sale_transactional(
  p_sale_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot_id UUID;
  v_quantity INTEGER;
BEGIN
  SELECT sale.cattle_lot_id, sale.quantity
  INTO v_lot_id, v_quantity
  FROM public.cattle_sales AS sale
  WHERE sale.id = p_sale_id
    AND COALESCE(sale.status, 'active') <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada ou já excluída.' USING ERRCODE = 'P0002';
  END IF;

  IF v_lot_id IS NOT NULL THEN
    PERFORM 1 FROM public.cattle_lots WHERE id = v_lot_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lote vinculado à venda não foi encontrado.' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.cattle_lots
    SET current_quantity = COALESCE(current_quantity, 0) + v_quantity,
        updated_at = now()
    WHERE id = v_lot_id;
  END IF;

  UPDATE public.cattle_sales
  SET status = 'deleted', updated_at = now()
  WHERE id = p_sale_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cattle_weighing_transactional(
  p_cattle_lot_id UUID,
  p_average_weight NUMERIC,
  p_weighing_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_weighing_id UUID;
BEGIN
  IF p_cattle_lot_id IS NULL OR p_average_weight IS NULL OR p_average_weight <= 0 THEN
    RAISE EXCEPTION 'Lote e peso médio positivo são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF p_weighing_date IS NULL THEN
    RAISE EXCEPTION 'Data da pesagem é obrigatória.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.cattle_lots AS lot
  WHERE lot.id = p_cattle_lot_id
    AND COALESCE(lot.status, 'active') <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado ou excluído.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.weighings (
    cattle_lot_id, average_weight, weighing_date, status
  ) VALUES (
    p_cattle_lot_id, p_average_weight, p_weighing_date, 'active'
  )
  RETURNING id INTO v_weighing_id;

  RETURN v_weighing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cattle_sale_transactional(UUID, TEXT, INTEGER, NUMERIC, DATE, DATE, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revert_cattle_sale_transactional(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_cattle_weighing_transactional(UUID, NUMERIC, DATE) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_cattle_sale_transactional(UUID, TEXT, INTEGER, NUMERIC, DATE, DATE, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revert_cattle_sale_transactional(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_cattle_weighing_transactional(UUID, NUMERIC, DATE) TO service_role;

COMMIT;

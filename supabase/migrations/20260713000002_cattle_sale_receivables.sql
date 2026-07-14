-- Close the cattle-sale receivable lifecycle without allowing duplicate income.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cattle_sales_payment_status_valid') THEN
    ALTER TABLE public.cattle_sales
      ADD CONSTRAINT cattle_sales_payment_status_valid
      CHECK (payment_status IN ('pending', 'paid', 'cancelled')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cattle_sales_shipment_after_negotiation') THEN
    ALTER TABLE public.cattle_sales
      ADD CONSTRAINT cattle_sales_shipment_after_negotiation
      CHECK (shipment_date IS NULL OR negotiation_date IS NULL OR shipment_date >= negotiation_date) NOT VALID;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_revenues_active_related_sale
  ON public.revenues (related_sale_id)
  WHERE related_sale_id IS NOT NULL AND status <> 'deleted';

CREATE OR REPLACE FUNCTION public.receive_cattle_sale_transactional(
  p_sale_id UUID,
  p_payment_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale public.cattle_sales%ROWTYPE;
  v_revenue_id UUID;
BEGIN
  IF p_sale_id IS NULL OR p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Venda e data do recebimento são obrigatórias.' USING ERRCODE = '22023';
  END IF;

  SELECT sale.* INTO v_sale
  FROM public.cattle_sales AS sale
  WHERE sale.id = p_sale_id AND COALESCE(sale.status, 'active') <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada ou excluída.' USING ERRCODE = 'P0002';
  END IF;
  IF v_sale.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Esta venda já foi recebida.' USING ERRCODE = '23505';
  END IF;
  IF COALESCE(v_sale.net_amount, v_sale.gross_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'A venda não possui valor válido para recebimento.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.revenues (
    category,
    description,
    amount,
    revenue_date,
    related_sale_id,
    status
  ) VALUES (
    'Venda de gado',
    'Recebimento de venda para ' || v_sale.buyer_name,
    COALESCE(v_sale.net_amount, v_sale.gross_amount),
    p_payment_date,
    v_sale.id,
    'active'
  )
  RETURNING id INTO v_revenue_id;

  UPDATE public.cattle_sales
  SET payment_status = 'paid',
      payment_received_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = v_sale.id;

  RETURN v_revenue_id;
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
  v_payment_status TEXT;
BEGIN
  SELECT sale.cattle_lot_id, sale.quantity, sale.payment_status
  INTO v_lot_id, v_quantity, v_payment_status
  FROM public.cattle_sales AS sale
  WHERE sale.id = p_sale_id
    AND COALESCE(sale.status, 'active') <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada ou já excluída.' USING ERRCODE = 'P0002';
  END IF;
  IF v_payment_status = 'paid' THEN
    RAISE EXCEPTION 'Uma venda recebida não pode ser excluída. Estorne primeiro o recebimento.'
      USING ERRCODE = '23514';
  END IF;

  IF v_lot_id IS NOT NULL THEN
    PERFORM 1 FROM public.cattle_lots WHERE id = v_lot_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lote vinculado à venda não foi encontrado.' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.cattle_lots
    SET current_quantity = COALESCE(current_quantity, 0) + v_quantity,
        updated_at = clock_timestamp()
    WHERE id = v_lot_id;
  END IF;

  UPDATE public.cattle_sales
  SET status = 'deleted', updated_at = clock_timestamp()
  WHERE id = p_sale_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_cattle_sale_transactional(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revert_cattle_sale_transactional(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_cattle_sale_transactional(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.revert_cattle_sale_transactional(UUID) TO service_role;

COMMIT;

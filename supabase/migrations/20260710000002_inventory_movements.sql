-- Atomic inventory movements and reversals.
-- New writes are constrained even when legacy rows still need cleanup.

BEGIN;

UPDATE public.inventory_items
SET current_quantity = 0
WHERE current_quantity IS NULL;

ALTER TABLE public.inventory_items
  ALTER COLUMN current_quantity SET DEFAULT 0,
  ALTER COLUMN current_quantity SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_current_quantity_nonnegative'
      AND conrelid = 'public.inventory_items'::regclass
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_current_quantity_nonnegative
      CHECK (current_quantity >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_movements_quantity_positive'
      AND conrelid = 'public.inventory_movements'::regclass
  ) THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_quantity_positive
      CHECK (quantity > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_movements_type_valid'
      AND conrelid = 'public.inventory_movements'::regclass
  ) THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_type_valid
      CHECK (movement_type IN ('in', 'out')) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_date
  ON public.inventory_movements (inventory_item_id, movement_date DESC, created_at DESC)
  WHERE status <> 'deleted';

CREATE OR REPLACE FUNCTION public.register_inventory_movement(
  p_inventory_item_id UUID,
  p_movement_type TEXT,
  p_quantity NUMERIC,
  p_movement_date DATE,
  p_unit TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_source_message_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (movement_id UUID, new_quantity NUMERIC)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
  v_type TEXT := lower(btrim(p_movement_type));
  v_new_quantity NUMERIC;
  v_movement_id UUID;
BEGIN
  IF p_inventory_item_id IS NULL THEN
    RAISE EXCEPTION 'Item de estoque é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF v_type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Tipo de movimentação deve ser in ou out.' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero.' USING ERRCODE = '22023';
  END IF;
  IF p_movement_date IS NULL THEN
    RAISE EXCEPTION 'Data da movimentação é obrigatória.' USING ERRCODE = '22023';
  END IF;

  SELECT item.*
  INTO v_item
  FROM public.inventory_items AS item
  WHERE item.id = p_inventory_item_id
    AND COALESCE(item.status, 'active') <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque não encontrado ou excluído.' USING ERRCODE = 'P0002';
  END IF;

  IF p_unit IS NOT NULL
    AND btrim(p_unit) <> ''
    AND v_item.unit IS NOT NULL
    AND lower(btrim(v_item.unit)) <> lower(btrim(p_unit)) THEN
    RAISE EXCEPTION 'Unidade incompatível: item usa %, movimento informou %.', v_item.unit, p_unit
      USING ERRCODE = '22023';
  END IF;

  v_new_quantity := v_item.current_quantity
    + CASE WHEN v_type = 'in' THEN p_quantity ELSE -p_quantity END;

  IF v_new_quantity < 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponível: %, saída solicitada: %.', v_item.current_quantity, p_quantity
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.inventory_items
  SET current_quantity = v_new_quantity,
      unit = COALESCE(unit, NULLIF(btrim(p_unit), '')),
      updated_at = now()
  WHERE id = v_item.id;

  INSERT INTO public.inventory_movements (
    inventory_item_id,
    movement_type,
    quantity,
    unit,
    movement_date,
    reason,
    source_message_id,
    notes,
    status
  ) VALUES (
    v_item.id,
    v_type,
    p_quantity,
    COALESCE(NULLIF(btrim(p_unit), ''), v_item.unit),
    p_movement_date,
    NULLIF(btrim(p_reason), ''),
    NULLIF(btrim(p_source_message_id), ''),
    NULLIF(btrim(p_notes), ''),
    'active'
  )
  RETURNING id INTO v_movement_id;

  RETURN QUERY SELECT v_movement_id, v_new_quantity;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_inventory_movement(p_movement_id UUID)
RETURNS TABLE (movement_id UUID, new_quantity NUMERIC)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_movement public.inventory_movements%ROWTYPE;
  v_item public.inventory_items%ROWTYPE;
  v_new_quantity NUMERIC;
BEGIN
  IF p_movement_id IS NULL THEN
    RAISE EXCEPTION 'Movimentação é obrigatória.' USING ERRCODE = '22023';
  END IF;

  SELECT movement.*
  INTO v_movement
  FROM public.inventory_movements AS movement
  WHERE movement.id = p_movement_id
    AND COALESCE(movement.status, 'active') <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimentação não encontrada ou já revertida.' USING ERRCODE = 'P0002';
  END IF;
  IF v_movement.inventory_item_id IS NULL THEN
    RAISE EXCEPTION 'Movimentação legada sem item não pode ser revertida automaticamente.' USING ERRCODE = '22023';
  END IF;
  IF v_movement.movement_type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Tipo da movimentação não permite reversão automática.' USING ERRCODE = '22023';
  END IF;

  SELECT item.*
  INTO v_item
  FROM public.inventory_items AS item
  WHERE item.id = v_movement.inventory_item_id
    AND COALESCE(item.status, 'active') <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item vinculado não encontrado ou excluído.' USING ERRCODE = 'P0002';
  END IF;

  v_new_quantity := v_item.current_quantity
    + CASE WHEN v_movement.movement_type = 'in' THEN -v_movement.quantity ELSE v_movement.quantity END;

  IF v_new_quantity < 0 THEN
    RAISE EXCEPTION 'A entrada não pode ser revertida porque parte do saldo já foi consumida.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.inventory_items
  SET current_quantity = v_new_quantity,
      updated_at = now()
  WHERE id = v_item.id;

  UPDATE public.inventory_movements
  SET status = 'deleted',
      updated_at = now()
  WHERE id = v_movement.id;

  RETURN QUERY SELECT v_movement.id, v_new_quantity;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_inventory_entry_by_name(
  p_item_name TEXT,
  p_quantity NUMERIC,
  p_unit TEXT,
  p_movement_date DATE,
  p_category TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_source_message_id TEXT DEFAULT NULL
)
RETURNS TABLE (movement_id UUID, new_quantity NUMERIC)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_id UUID;
BEGIN
  IF p_item_name IS NULL OR btrim(p_item_name) = '' THEN
    RAISE EXCEPTION 'Nome do item é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF p_unit IS NULL OR btrim(p_unit) = '' THEN
    RAISE EXCEPTION 'Unidade do item é obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero.' USING ERRCODE = '22023';
  END IF;

  -- Serializa entradas simultâneas do mesmo nome sem exigir índice único em dados legados.
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(btrim(p_item_name)), 0));

  SELECT item.id
  INTO v_item_id
  FROM public.inventory_items AS item
  WHERE lower(btrim(item.name)) = lower(btrim(p_item_name))
    AND COALESCE(item.status, 'active') <> 'deleted'
  ORDER BY item.created_at, item.id
  LIMIT 1
  FOR UPDATE;

  IF v_item_id IS NULL THEN
    INSERT INTO public.inventory_items (
      name,
      category,
      unit,
      current_quantity,
      status
    ) VALUES (
      btrim(p_item_name),
      NULLIF(btrim(p_category), ''),
      btrim(p_unit),
      0,
      'active'
    )
    RETURNING id INTO v_item_id;
  ELSE
    UPDATE public.inventory_items
    SET category = COALESCE(category, NULLIF(btrim(p_category), '')),
        updated_at = now()
    WHERE id = v_item_id;
  END IF;

  RETURN QUERY
  SELECT result.movement_id, result.new_quantity
  FROM public.register_inventory_movement(
    v_item_id,
    'in',
    p_quantity,
    p_movement_date,
    p_unit,
    p_reason,
    p_source_message_id,
    'Entrada de estoque via IA'
  ) AS result;
END;
$$;

REVOKE ALL ON FUNCTION public.register_inventory_movement(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revert_inventory_movement(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_inventory_entry_by_name(TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_inventory_movement(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revert_inventory_movement(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_inventory_entry_by_name(TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.register_inventory_movement(UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT)
  IS 'Registra entrada/saída e atualiza saldo do item sob lock na mesma transação.';
COMMENT ON FUNCTION public.revert_inventory_movement(UUID)
  IS 'Reverte uma movimentação ativa e recompõe o saldo sem permitir estoque negativo.';
COMMENT ON FUNCTION public.record_inventory_entry_by_name(TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT)
  IS 'Cria/localiza item por nome e registra uma entrada atômica para o fluxo de IA.';

COMMIT;

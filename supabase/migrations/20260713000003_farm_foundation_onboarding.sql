-- Complete farm foundation data and transactional first-run onboarding.

BEGIN;

ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS state_registration TEXT,
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_phone TEXT,
  ADD COLUMN IF NOT EXISTS municipality TEXT,
  ADD COLUMN IF NOT EXISTS state_code TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS total_area_ha NUMERIC,
  ADD COLUMN IF NOT EXISTS productive_area_ha NUMERIC,
  ADD COLUMN IF NOT EXISTS primary_activity TEXT,
  ADD COLUMN IF NOT EXISTS livestock_system TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Cuiaba',
  ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES public.farms(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES public.farms(id) ON DELETE SET NULL;

ALTER TABLE public.revenues
  ADD COLUMN IF NOT EXISTS related_farm_id UUID REFERENCES public.farms(id) ON DELETE SET NULL;

DO $$
DECLARE
  v_single_farm_id UUID;
BEGIN
  IF (SELECT COUNT(*) FROM public.farms WHERE COALESCE(status, 'active') <> 'deleted') = 1 THEN
    SELECT id INTO v_single_farm_id
    FROM public.farms
    WHERE COALESCE(status, 'active') <> 'deleted'
    LIMIT 1;

    UPDATE public.employees SET farm_id = v_single_farm_id WHERE farm_id IS NULL;
    UPDATE public.inventory_items SET farm_id = v_single_farm_id WHERE farm_id IS NULL;
    UPDATE public.revenues SET related_farm_id = v_single_farm_id WHERE related_farm_id IS NULL;
    UPDATE public.pastures SET farm_id = v_single_farm_id WHERE farm_id IS NULL;
    UPDATE public.cattle_lots SET farm_id = v_single_farm_id WHERE farm_id IS NULL;
    UPDATE public.expenses SET related_farm_id = v_single_farm_id WHERE related_farm_id IS NULL;
    UPDATE public.tasks SET related_farm_id = v_single_farm_id WHERE related_farm_id IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farms_area_positive') THEN
    ALTER TABLE public.farms
      ADD CONSTRAINT farms_area_positive
      CHECK (total_area_ha IS NULL OR total_area_ha > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farms_productive_area_valid') THEN
    ALTER TABLE public.farms
      ADD CONSTRAINT farms_productive_area_valid
      CHECK (
        productive_area_ha IS NULL
        OR (productive_area_ha >= 0 AND (total_area_ha IS NULL OR productive_area_ha <= total_area_ha))
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farms_state_code_valid') THEN
    ALTER TABLE public.farms
      ADD CONSTRAINT farms_state_code_valid
      CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farms_primary_activity_valid') THEN
    ALTER TABLE public.farms
      ADD CONSTRAINT farms_primary_activity_valid
      CHECK (primary_activity IS NULL OR primary_activity IN (
        'beef_cattle', 'dairy_cattle', 'mixed_cattle', 'agriculture', 'mixed_farming', 'other'
      )) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farms_livestock_system_valid') THEN
    ALTER TABLE public.farms
      ADD CONSTRAINT farms_livestock_system_valid
      CHECK (livestock_system IS NULL OR livestock_system IN (
        'extensive', 'semi_intensive', 'intensive', 'not_applicable'
      )) NOT VALID;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_farms_active_document
  ON public.farms (document_number)
  WHERE document_number IS NOT NULL AND status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_employees_farm_active
  ON public.employees (farm_id, full_name) WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_inventory_items_farm_active
  ON public.inventory_items (farm_id, name) WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS idx_revenues_farm_date_active
  ON public.revenues (related_farm_id, revenue_date DESC) WHERE status <> 'deleted';

-- Preserve the farm context for every insertion path (screens, imports, webhooks
-- and AI actions). Automatic assignment only happens when there is exactly one
-- active farm; multi-farm installations must always choose the unit explicitly.
CREATE OR REPLACE FUNCTION public.assign_single_active_farm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_farm_id UUID;
  v_active_farm_count INTEGER;
  v_target_column TEXT := TG_ARGV[0];
BEGIN
  IF NULLIF(to_jsonb(NEW)->>v_target_column, '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO v_active_farm_count
  FROM public.farms
  WHERE COALESCE(status, 'active') <> 'deleted';

  IF v_active_farm_count <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT id
  INTO v_farm_id
  FROM public.farms
  WHERE COALESCE(status, 'active') <> 'deleted'
  ORDER BY created_at, id
  LIMIT 1;

  IF v_farm_id IS NOT NULL THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(v_target_column, v_farm_id));
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_trigger RECORD;
BEGIN
  FOR v_trigger IN
    SELECT * FROM (VALUES
      ('pastures', 'farm_id'),
      ('cattle_lots', 'farm_id'),
      ('employees', 'farm_id'),
      ('inventory_items', 'farm_id'),
      ('expenses', 'related_farm_id'),
      ('revenues', 'related_farm_id'),
      ('tasks', 'related_farm_id')
    ) AS targets(table_name, column_name)
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.%I',
      'trg_' || v_trigger.table_name || '_farm_context',
      v_trigger.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.assign_single_active_farm(%L)',
      'trg_' || v_trigger.table_name || '_farm_context',
      v_trigger.table_name,
      v_trigger.column_name
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.assign_single_active_farm()
  IS 'Vincula novos registros automaticamente quando existe uma única fazenda ativa.';

CREATE OR REPLACE FUNCTION public.configure_farm_foundation_transactional(
  p_farm_id UUID,
  p_profile JSONB,
  p_pastures JSONB DEFAULT '[]'::JSONB,
  p_cattle_lots JSONB DEFAULT '[]'::JSONB,
  p_employees JSONB DEFAULT '[]'::JSONB,
  p_inventory_items JSONB DEFAULT '[]'::JSONB,
  p_actor_profile_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_farm_id UUID;
  v_existing public.farms%ROWTYPE;
  v_item JSONB;
  v_pasture_id UUID;
  v_total_area NUMERIC;
  v_productive_area NUMERIC;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Dados da propriedade inválidos.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_profile->>'name'), '') IS NULL
    OR NULLIF(btrim(p_profile->>'municipality'), '') IS NULL
    OR NULLIF(btrim(p_profile->>'state_code'), '') IS NULL THEN
    RAISE EXCEPTION 'Nome, município e UF são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  v_total_area := NULLIF(p_profile->>'total_area_ha', '')::NUMERIC;
  v_productive_area := NULLIF(p_profile->>'productive_area_ha', '')::NUMERIC;
  IF v_total_area IS NULL OR v_total_area <= 0 THEN
    RAISE EXCEPTION 'A área total deve ser maior que zero.' USING ERRCODE = '23514';
  END IF;
  IF v_productive_area IS NOT NULL AND (v_productive_area < 0 OR v_productive_area > v_total_area) THEN
    RAISE EXCEPTION 'A área produtiva deve estar entre zero e a área total.' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(COALESCE(p_pastures, '[]'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_cattle_lots, '[]'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_employees, '[]'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_inventory_items, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'As listas da implantação são inválidas.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(COALESCE(p_pastures, '[]'::JSONB)) > 100
    OR jsonb_array_length(COALESCE(p_cattle_lots, '[]'::JSONB)) > 100
    OR jsonb_array_length(COALESCE(p_employees, '[]'::JSONB)) > 100
    OR jsonb_array_length(COALESCE(p_inventory_items, '[]'::JSONB)) > 200 THEN
    RAISE EXCEPTION 'A implantação excede o limite de registros por etapa.' USING ERRCODE = '22023';
  END IF;

  IF p_actor_profile_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users_profiles
    WHERE id = p_actor_profile_id AND is_active = true
      AND lower(role) IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Somente a administração pode concluir a implantação.' USING ERRCODE = '42501';
  END IF;

  IF p_farm_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.farms WHERE COALESCE(status, 'active') <> 'deleted') THEN
      RAISE EXCEPTION 'Já existe uma fazenda ativa; selecione-a para atualizar a base.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.farms (
      name, legal_name, document_number, state_registration, owner_name, owner_phone,
      municipality, state_code, postal_code, address, location_description,
      total_area_ha, productive_area_ha, primary_activity, livestock_system,
      timezone, notes, status, created_by
    ) VALUES (
      btrim(p_profile->>'name'), NULLIF(btrim(p_profile->>'legal_name'), ''),
      NULLIF(btrim(p_profile->>'document_number'), ''), NULLIF(btrim(p_profile->>'state_registration'), ''),
      NULLIF(btrim(p_profile->>'owner_name'), ''), NULLIF(btrim(p_profile->>'owner_phone'), ''),
      btrim(p_profile->>'municipality'), upper(btrim(p_profile->>'state_code')),
      NULLIF(btrim(p_profile->>'postal_code'), ''), NULLIF(btrim(p_profile->>'address'), ''),
      NULLIF(btrim(p_profile->>'location_description'), ''), v_total_area, v_productive_area,
      p_profile->>'primary_activity', p_profile->>'livestock_system',
      COALESCE(NULLIF(p_profile->>'timezone', ''), 'America/Cuiaba'),
      NULLIF(btrim(p_profile->>'notes'), ''), 'active', p_actor_profile_id
    ) RETURNING id INTO v_farm_id;
  ELSE
    SELECT * INTO v_existing
    FROM public.farms
    WHERE id = p_farm_id AND COALESCE(status, 'active') <> 'deleted'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Fazenda não encontrada ou excluída.' USING ERRCODE = 'P0002';
    END IF;
    IF v_existing.setup_completed_at IS NOT NULL AND (
      jsonb_array_length(COALESCE(p_pastures, '[]'::JSONB)) > 0
      OR jsonb_array_length(COALESCE(p_cattle_lots, '[]'::JSONB)) > 0
      OR jsonb_array_length(COALESCE(p_employees, '[]'::JSONB)) > 0
      OR jsonb_array_length(COALESCE(p_inventory_items, '[]'::JSONB)) > 0
    ) THEN
      RAISE EXCEPTION 'A base já foi implantada. Atualize cadastros pelos módulos específicos.' USING ERRCODE = '23514';
    END IF;

    v_farm_id := v_existing.id;
    UPDATE public.farms SET
      name = btrim(p_profile->>'name'), legal_name = NULLIF(btrim(p_profile->>'legal_name'), ''),
      document_number = NULLIF(btrim(p_profile->>'document_number'), ''),
      state_registration = NULLIF(btrim(p_profile->>'state_registration'), ''),
      owner_name = NULLIF(btrim(p_profile->>'owner_name'), ''), owner_phone = NULLIF(btrim(p_profile->>'owner_phone'), ''),
      municipality = btrim(p_profile->>'municipality'), state_code = upper(btrim(p_profile->>'state_code')),
      postal_code = NULLIF(btrim(p_profile->>'postal_code'), ''), address = NULLIF(btrim(p_profile->>'address'), ''),
      location_description = NULLIF(btrim(p_profile->>'location_description'), ''),
      total_area_ha = v_total_area, productive_area_ha = v_productive_area,
      primary_activity = p_profile->>'primary_activity', livestock_system = p_profile->>'livestock_system',
      timezone = COALESCE(NULLIF(p_profile->>'timezone', ''), 'America/Cuiaba'),
      notes = NULLIF(btrim(p_profile->>'notes'), '')
    WHERE id = v_farm_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_pastures, '[]'::JSONB)) LOOP
    IF NULLIF(btrim(v_item->>'name'), '') IS NULL THEN
      RAISE EXCEPTION 'Todo pasto precisa de nome.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.pastures (
      farm_id, name, approximate_capacity, current_condition, rest_status, status
    ) VALUES (
      v_farm_id, btrim(v_item->>'name'), NULLIF(v_item->>'approximate_capacity', '')::NUMERIC,
      NULLIF(btrim(v_item->>'current_condition'), ''), 'em_uso', 'active'
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_cattle_lots, '[]'::JSONB)) LOOP
    v_pasture_id := NULL;
    IF NULLIF(btrim(v_item->>'pasture_name'), '') IS NOT NULL THEN
      SELECT id INTO v_pasture_id FROM public.pastures
      WHERE farm_id = v_farm_id AND lower(name) = lower(btrim(v_item->>'pasture_name'))
        AND COALESCE(status, 'active') <> 'deleted'
      ORDER BY created_at DESC LIMIT 1;
      IF v_pasture_id IS NULL THEN
        RAISE EXCEPTION 'Pasto do lote "%" não encontrado.', v_item->>'pasture_name' USING ERRCODE = 'P0002';
      END IF;
    END IF;
    INSERT INTO public.cattle_lots (
      farm_id, pasture_id, name, category, current_quantity, origin, status
    ) VALUES (
      v_farm_id, v_pasture_id, btrim(v_item->>'name'), NULLIF(btrim(v_item->>'category'), ''),
      (v_item->>'current_quantity')::INTEGER, 'Saldo inicial da implantação', 'active'
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_employees, '[]'::JSONB)) LOOP
    INSERT INTO public.employees (
      farm_id, full_name, role_description, salary_amount, phone_number, status
    ) VALUES (
      v_farm_id, btrim(v_item->>'full_name'), NULLIF(btrim(v_item->>'role_description'), ''),
      NULLIF(v_item->>'salary_amount', '')::NUMERIC, NULLIF(btrim(v_item->>'phone_number'), ''), 'active'
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_inventory_items, '[]'::JSONB)) LOOP
    INSERT INTO public.inventory_items (
      farm_id, name, category, current_quantity, minimum_quantity, unit, status
    ) VALUES (
      v_farm_id, btrim(v_item->>'name'), NULLIF(btrim(v_item->>'category'), ''),
      (v_item->>'current_quantity')::NUMERIC, NULLIF(v_item->>'minimum_quantity', '')::NUMERIC,
      btrim(v_item->>'unit'), 'active'
    );
  END LOOP;

  UPDATE public.farms
  SET setup_completed_at = COALESCE(setup_completed_at, clock_timestamp()), updated_at = clock_timestamp()
  WHERE id = v_farm_id;

  RETURN v_farm_id;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_farm_foundation_transactional(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_farm_foundation_transactional(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, UUID)
  TO service_role;

COMMENT ON FUNCTION public.configure_farm_foundation_transactional(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, UUID)
  IS 'Cria ou atualiza a base da fazenda e insere saldos iniciais em uma única transação.';

COMMIT;

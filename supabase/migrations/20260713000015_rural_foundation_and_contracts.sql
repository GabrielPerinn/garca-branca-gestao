-- Rural master data and agricultural contracts. This expands the foundation
-- beyond basic livestock without treating lease receipts as isolated revenue.

BEGIN;

CREATE TABLE public.land_parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tenure_type TEXT NOT NULL DEFAULT 'owned',
  total_area_ha NUMERIC NOT NULL,
  usable_area_ha NUMERIC,
  municipality TEXT,
  state_code TEXT,
  property_registration TEXT,
  car_code TEXT,
  ccir_code TEXT,
  cib_nirf TEXT,
  georeferencing_status TEXT NOT NULL DEFAULT 'not_informed',
  boundary_geojson JSONB,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT land_parcels_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 180),
  CONSTRAINT land_parcels_tenure_valid CHECK (tenure_type IN ('owned', 'leased_in', 'leased_out', 'partnership', 'commodatum', 'other')),
  CONSTRAINT land_parcels_area_valid CHECK (total_area_ha > 0 AND (usable_area_ha IS NULL OR usable_area_ha BETWEEN 0 AND total_area_ha)),
  CONSTRAINT land_parcels_state_valid CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$'),
  CONSTRAINT land_parcels_geo_status_valid CHECK (georeferencing_status IN ('not_informed', 'pending', 'certified', 'not_applicable')),
  CONSTRAINT land_parcels_status_valid CHECK (status IN ('active', 'inactive', 'deleted')),
  CONSTRAINT land_parcels_farm_name_unique UNIQUE (farm_id, name)
);

CREATE TABLE public.agricultural_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  land_parcel_id UUID REFERENCES public.land_parcels(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  area_ha NUMERIC NOT NULL,
  current_use TEXT,
  soil_type TEXT,
  irrigation_type TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT agricultural_fields_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 180),
  CONSTRAINT agricultural_fields_area_valid CHECK (area_ha > 0),
  CONSTRAINT agricultural_fields_coordinates_valid CHECK ((latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)),
  CONSTRAINT agricultural_fields_status_valid CHECK (status IN ('active', 'inactive', 'deleted')),
  CONSTRAINT agricultural_fields_farm_name_unique UNIQUE (farm_id, name)
);

CREATE TABLE public.farm_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  identification TEXT,
  manufacturer TEXT,
  model TEXT,
  model_year INTEGER,
  acquisition_date DATE,
  acquisition_value NUMERIC,
  current_meter NUMERIC,
  meter_unit TEXT,
  location_description TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT farm_assets_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 180),
  CONSTRAINT farm_assets_type_valid CHECK (asset_type IN ('machine', 'vehicle', 'implement', 'building', 'storage', 'water', 'energy', 'corral', 'fence', 'other')),
  CONSTRAINT farm_assets_values_valid CHECK ((model_year IS NULL OR model_year BETWEEN 1900 AND 2200) AND (acquisition_value IS NULL OR acquisition_value >= 0) AND (current_meter IS NULL OR current_meter >= 0)),
  CONSTRAINT farm_assets_status_valid CHECK (status IN ('active', 'maintenance', 'inactive', 'sold', 'deleted'))
);

CREATE TABLE public.rural_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  land_parcel_id UUID NOT NULL REFERENCES public.land_parcels(id) ON DELETE RESTRICT,
  contract_number TEXT,
  title TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  farm_role TEXT NOT NULL,
  counterparty_name TEXT NOT NULL,
  counterparty_document TEXT,
  counterparty_phone TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  area_ha NUMERIC NOT NULL,
  activity TEXT NOT NULL,
  crop_name TEXT,
  payment_type TEXT NOT NULL,
  payment_amount NUMERIC,
  payment_frequency TEXT,
  first_due_date DATE,
  installment_count INTEGER,
  product_name TEXT,
  product_quantity NUMERIC,
  production_percentage NUMERIC,
  adjustment_index TEXT,
  renewal_notice_days INTEGER NOT NULL DEFAULT 90,
  conservation_obligations TEXT,
  improvement_responsibility TEXT,
  tax_responsibility TEXT,
  source_message_id TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT rural_contracts_title_length CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  CONSTRAINT rural_contracts_type_valid CHECK (contract_type IN ('rural_lease', 'rural_partnership', 'commodatum', 'sublease', 'other')),
  CONSTRAINT rural_contracts_role_valid CHECK (farm_role IN ('grantor', 'grantee')),
  CONSTRAINT rural_contracts_period_valid CHECK (end_date > start_date),
  CONSTRAINT rural_contracts_area_valid CHECK (area_ha > 0),
  CONSTRAINT rural_contracts_payment_type_valid CHECK (payment_type IN ('fixed_money', 'per_hectare', 'product_quantity', 'production_percentage', 'mixed', 'free')),
  CONSTRAINT rural_contracts_frequency_valid CHECK (payment_frequency IS NULL OR payment_frequency IN ('monthly', 'quarterly', 'semiannual', 'annual', 'harvest', 'single', 'custom')),
  CONSTRAINT rural_contracts_payment_values_valid CHECK (
    (payment_amount IS NULL OR payment_amount >= 0)
    AND (product_quantity IS NULL OR product_quantity > 0)
    AND (production_percentage IS NULL OR production_percentage > 0 AND production_percentage <= 100)
    AND (installment_count IS NULL OR installment_count BETWEEN 1 AND 120)
    AND renewal_notice_days BETWEEN 0 AND 730
  ),
  CONSTRAINT rural_contracts_fixed_payment_complete CHECK (
    payment_type NOT IN ('fixed_money', 'per_hectare')
    OR (payment_amount IS NOT NULL AND payment_amount > 0 AND payment_frequency IS NOT NULL AND first_due_date IS NOT NULL)
  ),
  CONSTRAINT rural_contracts_schedule_complete CHECK (
    payment_type = 'free' OR (payment_frequency IS NOT NULL AND first_due_date IS NOT NULL)
  ),
  CONSTRAINT rural_contracts_product_payment_complete CHECK (
    payment_type NOT IN ('product_quantity', 'mixed') OR (product_name IS NOT NULL AND product_quantity IS NOT NULL)
  ),
  CONSTRAINT rural_contracts_percentage_complete CHECK (
    payment_type NOT IN ('production_percentage', 'mixed') OR production_percentage IS NOT NULL
  ),
  CONSTRAINT rural_contracts_status_valid CHECK (status IN ('draft', 'active', 'expired', 'terminated', 'cancelled'))
);

CREATE TABLE public.rural_contract_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.rural_contracts(id) ON DELETE RESTRICT,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC,
  product_name TEXT,
  product_quantity NUMERIC,
  status TEXT NOT NULL DEFAULT 'scheduled',
  received_at TIMESTAMPTZ,
  revenue_id UUID REFERENCES public.revenues(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT rural_installments_number_positive CHECK (installment_number > 0),
  CONSTRAINT rural_installments_values_valid CHECK ((amount IS NULL OR amount > 0) AND (product_quantity IS NULL OR product_quantity > 0)),
  CONSTRAINT rural_installments_status_valid CHECK (status IN ('scheduled', 'received', 'overdue', 'cancelled')),
  CONSTRAINT rural_installments_contract_number_unique UNIQUE (contract_id, installment_number)
);

CREATE INDEX idx_land_parcels_farm_status ON public.land_parcels (farm_id, status, name);
CREATE INDEX idx_agricultural_fields_farm_status ON public.agricultural_fields (farm_id, status, name);
CREATE INDEX idx_farm_assets_farm_type ON public.farm_assets (farm_id, asset_type, status, name);
CREATE INDEX idx_rural_contracts_farm_status_end ON public.rural_contracts (farm_id, status, end_date);
CREATE INDEX idx_rural_installments_due ON public.rural_contract_installments (farm_id, status, due_date);
CREATE UNIQUE INDEX uq_rural_contract_active_alert ON public.alerts (related_table, related_id)
  WHERE related_table = 'rural_contracts' AND status <> 'deleted';
CREATE UNIQUE INDEX uq_rural_installment_active_alert ON public.alerts (related_table, related_id)
  WHERE related_table = 'rural_contract_installments' AND status <> 'deleted';

CREATE OR REPLACE FUNCTION public.insert_rural_contract(
  p_farm_id UUID,
  p_payload JSONB,
  p_actor_profile_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract_id UUID;
  v_parcel_id UUID;
  v_parcel_name TEXT;
  v_contract_type TEXT;
  v_farm_role TEXT;
  v_payment_type TEXT;
  v_frequency TEXT;
  v_start DATE;
  v_end DATE;
  v_due DATE;
  v_area NUMERIC;
  v_amount NUMERIC;
  v_count INTEGER;
  v_step_months INTEGER;
  v_index INTEGER;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Dados do contrato são obrigatórios.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.farms WHERE id = p_farm_id AND COALESCE(status, 'active') <> 'deleted') THEN
    RAISE EXCEPTION 'Fazenda não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  v_parcel_name := NULLIF(btrim(p_payload->>'parcel_name'), '');
  v_contract_type := COALESCE(NULLIF(p_payload->>'contract_type', ''), 'rural_lease');
  v_farm_role := COALESCE(NULLIF(p_payload->>'farm_role', ''), 'grantor');
  v_payment_type := COALESCE(NULLIF(p_payload->>'payment_type', ''), 'fixed_money');
  v_frequency := NULLIF(p_payload->>'payment_frequency', '');
  v_start := NULLIF(p_payload->>'start_date', '')::DATE;
  v_end := NULLIF(p_payload->>'end_date', '')::DATE;
  v_due := NULLIF(p_payload->>'first_due_date', '')::DATE;
  v_area := NULLIF(p_payload->>'area_ha', '')::NUMERIC;
  v_amount := NULLIF(p_payload->>'payment_amount', '')::NUMERIC;
  v_count := COALESCE(NULLIF(p_payload->>'installment_count', '')::INTEGER, 1);

  IF v_parcel_name IS NULL OR NULLIF(btrim(p_payload->>'counterparty_name'), '') IS NULL
    OR NULLIF(btrim(p_payload->>'activity'), '') IS NULL OR v_start IS NULL OR v_end IS NULL
    OR v_end <= v_start OR v_area IS NULL OR v_area <= 0 THEN
    RAISE EXCEPTION 'Contrato exige área identificada, contraparte, atividade, período e hectares.' USING ERRCODE = '22023';
  END IF;
  IF v_contract_type NOT IN ('rural_lease', 'rural_partnership', 'commodatum', 'sublease', 'other')
    OR v_farm_role NOT IN ('grantor', 'grantee')
    OR v_payment_type NOT IN ('fixed_money', 'per_hectare', 'product_quantity', 'production_percentage', 'mixed', 'free') THEN
    RAISE EXCEPTION 'Tipo de contrato, papel ou pagamento inválido.' USING ERRCODE = '22023';
  END IF;
  IF v_payment_type IN ('fixed_money', 'per_hectare') AND (v_amount IS NULL OR v_amount <= 0) THEN
    RAISE EXCEPTION 'Pagamento em dinheiro exige valor positivo.' USING ERRCODE = '22023';
  END IF;
  IF v_payment_type <> 'free' AND (v_due IS NULL OR v_frequency IS NULL) THEN
    RAISE EXCEPTION 'Remuneração contratual exige frequência e primeiro vencimento.' USING ERRCODE = '22023';
  END IF;
  IF v_count < 1 OR v_count > 120 THEN RAISE EXCEPTION 'Quantidade de parcelas inválida.' USING ERRCODE = '22023'; END IF;

  SELECT id INTO v_parcel_id FROM public.land_parcels
  WHERE farm_id = p_farm_id AND lower(name) = lower(v_parcel_name) AND status <> 'deleted'
  LIMIT 1;
  IF v_parcel_id IS NULL THEN
    INSERT INTO public.land_parcels (farm_id, name, tenure_type, total_area_ha, created_by)
    VALUES (
      p_farm_id, v_parcel_name,
      CASE WHEN v_farm_role = 'grantor' THEN 'leased_out' ELSE 'leased_in' END,
      v_area, p_actor_profile_id
    ) RETURNING id INTO v_parcel_id;
  END IF;

  INSERT INTO public.rural_contracts (
    farm_id, land_parcel_id, contract_number, title, contract_type, farm_role,
    counterparty_name, counterparty_document, counterparty_phone, start_date, end_date,
    area_ha, activity, crop_name, payment_type, payment_amount, payment_frequency,
    first_due_date, installment_count, product_name, product_quantity,
    production_percentage, adjustment_index, renewal_notice_days,
    conservation_obligations, improvement_responsibility, tax_responsibility,
    source_message_id, notes, status, created_by, reviewed_by, reviewed_at
  ) VALUES (
    p_farm_id, v_parcel_id, NULLIF(btrim(p_payload->>'contract_number'), ''),
    COALESCE(NULLIF(btrim(p_payload->>'title'), ''), initcap(replace(v_contract_type, '_', ' ')) || ' — ' || btrim(p_payload->>'counterparty_name')),
    v_contract_type, v_farm_role, btrim(p_payload->>'counterparty_name'),
    NULLIF(btrim(p_payload->>'counterparty_document'), ''), NULLIF(btrim(p_payload->>'counterparty_phone'), ''),
    v_start, v_end, v_area, btrim(p_payload->>'activity'), NULLIF(btrim(p_payload->>'crop_name'), ''),
    v_payment_type, v_amount, v_frequency, v_due, v_count,
    NULLIF(btrim(p_payload->>'product_name'), ''), NULLIF(p_payload->>'product_quantity', '')::NUMERIC,
    NULLIF(p_payload->>'production_percentage', '')::NUMERIC, NULLIF(btrim(p_payload->>'adjustment_index'), ''),
    COALESCE(NULLIF(p_payload->>'renewal_notice_days', '')::INTEGER, 90),
    NULLIF(btrim(p_payload->>'conservation_obligations'), ''), NULLIF(btrim(p_payload->>'improvement_responsibility'), ''),
    NULLIF(btrim(p_payload->>'tax_responsibility'), ''), NULLIF(btrim(p_payload->>'source_message_id'), ''),
    NULLIF(btrim(p_payload->>'notes'), ''), 'active', p_actor_profile_id, p_actor_profile_id, clock_timestamp()
  ) RETURNING id INTO v_contract_id;

  IF v_due IS NOT NULL THEN
    v_step_months := CASE v_frequency WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 WHEN 'semiannual' THEN 6 WHEN 'annual' THEN 12 ELSE 0 END;
    FOR v_index IN 1..v_count LOOP
      INSERT INTO public.rural_contract_installments (
        farm_id, contract_id, installment_number, due_date, amount, product_name, product_quantity
      ) VALUES (
        p_farm_id, v_contract_id, v_index, v_due,
        CASE WHEN v_payment_type = 'per_hectare' THEN v_amount * v_area WHEN v_payment_type IN ('fixed_money', 'mixed') THEN v_amount ELSE NULL END,
        NULLIF(btrim(p_payload->>'product_name'), ''), NULLIF(p_payload->>'product_quantity', '')::NUMERIC
      );
      IF v_step_months > 0 THEN v_due := (v_due + make_interval(months => v_step_months))::DATE; END IF;
    END LOOP;
  END IF;
  RETURN v_contract_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_rural_contract_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status NOT IN ('active', 'draft') THEN
    UPDATE public.alerts SET status = 'completed', updated_at = clock_timestamp()
    WHERE related_table = 'rural_contracts' AND related_id = NEW.id AND status <> 'deleted';
    RETURN NEW;
  END IF;
  INSERT INTO public.alerts (alert_type, title, message, due_date, related_table, related_id, status)
  VALUES ('contract_renewal', 'Revisar contrato: ' || NEW.title,
    'Verifique renovação, comunicação à contraparte e obrigações antes do término.',
    GREATEST(NEW.start_date, NEW.end_date - NEW.renewal_notice_days), 'rural_contracts', NEW.id, 'pending')
  ON CONFLICT (related_table, related_id) WHERE related_table = 'rural_contracts' AND status <> 'deleted'
  DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, due_date = EXCLUDED.due_date,
    status = 'pending', updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_rural_installment_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_title TEXT;
BEGIN
  SELECT title INTO v_title FROM public.rural_contracts WHERE id = NEW.contract_id;
  IF NEW.status IN ('received', 'cancelled') THEN
    UPDATE public.alerts SET status = CASE WHEN NEW.status = 'received' THEN 'completed' ELSE 'deleted' END,
      updated_at = clock_timestamp()
    WHERE related_table = 'rural_contract_installments' AND related_id = NEW.id AND status <> 'deleted';
    RETURN NEW;
  END IF;
  INSERT INTO public.alerts (alert_type, title, message, due_date, related_table, related_id, status)
  VALUES ('contract_receivable', 'Recebimento de contrato: ' || COALESCE(v_title, 'Contrato rural'),
    'Confirme o recebimento da parcela ' || NEW.installment_number || ' e vincule a receita.',
    NEW.due_date, 'rural_contract_installments', NEW.id, 'pending')
  ON CONFLICT (related_table, related_id) WHERE related_table = 'rural_contract_installments' AND status <> 'deleted'
  DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message, due_date = EXCLUDED.due_date,
    status = 'pending', updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_rural_contract_installment(
  p_installment_id UUID,
  p_received_date DATE,
  p_actor_profile_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_installment public.rural_contract_installments%ROWTYPE; v_contract public.rural_contracts%ROWTYPE; v_revenue_id UUID;
BEGIN
  SELECT * INTO v_installment FROM public.rural_contract_installments WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF v_installment.status = 'received' AND v_installment.revenue_id IS NOT NULL THEN RETURN v_installment.revenue_id; END IF;
  IF v_installment.amount IS NULL OR v_installment.amount <= 0 THEN
    RAISE EXCEPTION 'A parcela não possui valor monetário para gerar receita.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_contract FROM public.rural_contracts WHERE id = v_installment.contract_id;
  INSERT INTO public.revenues (category, description, amount, revenue_date, status)
  VALUES ('Arrendamento rural', v_contract.title || ' — parcela ' || v_installment.installment_number,
    v_installment.amount, COALESCE(p_received_date, current_date), 'active') RETURNING id INTO v_revenue_id;
  UPDATE public.rural_contract_installments SET status = 'received', received_at = clock_timestamp(),
    revenue_id = v_revenue_id, updated_at = clock_timestamp() WHERE id = p_installment_id;
  RETURN v_revenue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_rural_contract_pending_action(
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
DECLARE v_pending public.pending_actions%ROWTYPE; v_farm_id UUID; v_contract_id UUID; v_error TEXT;
BEGIN
  UPDATE public.pending_actions SET confirmation_status = 'processing', updated_at = clock_timestamp()
  WHERE id = p_action_id AND action_type = 'create_rural_contract' AND confirmation_status = 'pending'
    AND (expires_at IS NULL OR expires_at > clock_timestamp())
    AND (p_expected_source_message_id IS NULL OR source_message_id = p_expected_source_message_id)
  RETURNING * INTO v_pending;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Ação não encontrada, expirada ou já processada.'::TEXT; RETURN; END IF;
  BEGIN
    SELECT id INTO v_farm_id FROM public.farms WHERE COALESCE(status, 'active') <> 'deleted' ORDER BY created_at LIMIT 1;
    IF v_farm_id IS NULL THEN RAISE EXCEPTION 'Cadastre a propriedade antes do contrato.' USING ERRCODE = 'P0002'; END IF;
    v_contract_id := public.insert_rural_contract(v_farm_id, p_payload || jsonb_build_object('source_message_id', v_pending.source_message_id), p_actor_profile_id);
    UPDATE public.pending_actions SET confirmation_status = 'completed', confirmed_by = p_actor_profile_id,
      confirmed_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = v_pending.id;
    INSERT INTO public.audit_logs (table_name, record_id, action, after_data_json, changed_by, reason, source_message_id)
    VALUES ('pending_actions', v_pending.id, 'execute_pending_action',
      jsonb_build_object('confirmation_status', 'completed', 'execution_result_id', v_contract_id),
      p_actor_profile_id, COALESCE(NULLIF(btrim(p_reason), ''), 'Approved rural contract'), v_pending.source_message_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    UPDATE public.pending_actions SET confirmation_status = 'failed', updated_at = clock_timestamp() WHERE id = v_pending.id;
    RETURN QUERY SELECT false, left(v_error, 1000); RETURN;
  END;
  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_farm_foundation_v2_transactional(
  p_farm_id UUID,
  p_profile JSONB,
  p_pastures JSONB,
  p_cattle_lots JSONB,
  p_employees JSONB,
  p_inventory_items JSONB,
  p_land_parcels JSONB,
  p_agricultural_fields JSONB,
  p_farm_assets JSONB,
  p_rural_contracts JSONB,
  p_actor_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_farm_id UUID; v_item JSONB; v_parcel_id UUID;
BEGIN
  IF jsonb_typeof(COALESCE(p_land_parcels, '[]')) <> 'array' OR jsonb_typeof(COALESCE(p_agricultural_fields, '[]')) <> 'array'
    OR jsonb_typeof(COALESCE(p_farm_assets, '[]')) <> 'array' OR jsonb_typeof(COALESCE(p_rural_contracts, '[]')) <> 'array' THEN
    RAISE EXCEPTION 'Listas complementares da implantação são inválidas.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(COALESCE(p_land_parcels, '[]')) > 100 OR jsonb_array_length(COALESCE(p_agricultural_fields, '[]')) > 300
    OR jsonb_array_length(COALESCE(p_farm_assets, '[]')) > 300 OR jsonb_array_length(COALESCE(p_rural_contracts, '[]')) > 100 THEN
    RAISE EXCEPTION 'A implantação complementar excede o limite de registros.' USING ERRCODE = '22023';
  END IF;
  v_farm_id := public.configure_farm_foundation_transactional(p_farm_id, p_profile, p_pastures, p_cattle_lots, p_employees, p_inventory_items, p_actor_profile_id);
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_land_parcels, '[]')) LOOP
    INSERT INTO public.land_parcels (farm_id, name, tenure_type, total_area_ha, usable_area_ha, municipality, state_code,
      property_registration, car_code, ccir_code, cib_nirf, georeferencing_status, notes, created_by)
    VALUES (v_farm_id, btrim(v_item->>'name'), COALESCE(NULLIF(v_item->>'tenure_type',''),'owned'),
      NULLIF(v_item->>'total_area_ha','')::NUMERIC, NULLIF(v_item->>'usable_area_ha','')::NUMERIC,
      NULLIF(btrim(v_item->>'municipality'),''), NULLIF(upper(btrim(v_item->>'state_code')),''),
      NULLIF(btrim(v_item->>'property_registration'),''), NULLIF(btrim(v_item->>'car_code'),''),
      NULLIF(btrim(v_item->>'ccir_code'),''), NULLIF(btrim(v_item->>'cib_nirf'),''),
      COALESCE(NULLIF(v_item->>'georeferencing_status',''),'not_informed'), NULLIF(btrim(v_item->>'notes'),''), p_actor_profile_id)
    ON CONFLICT (farm_id, name) DO NOTHING;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_agricultural_fields, '[]')) LOOP
    v_parcel_id := NULL;
    SELECT id INTO v_parcel_id FROM public.land_parcels WHERE farm_id = v_farm_id AND lower(name) = lower(btrim(v_item->>'parcel_name')) AND status <> 'deleted' LIMIT 1;
    IF NULLIF(btrim(v_item->>'parcel_name'),'') IS NOT NULL AND v_parcel_id IS NULL THEN RAISE EXCEPTION 'Imóvel do talhão não encontrado: %', v_item->>'parcel_name' USING ERRCODE = 'P0002'; END IF;
    INSERT INTO public.agricultural_fields (farm_id, land_parcel_id, name, area_ha, current_use, soil_type, irrigation_type, notes, created_by)
    VALUES (v_farm_id, v_parcel_id, btrim(v_item->>'name'), NULLIF(v_item->>'area_ha','')::NUMERIC,
      NULLIF(btrim(v_item->>'current_use'),''), NULLIF(btrim(v_item->>'soil_type'),''),
      NULLIF(btrim(v_item->>'irrigation_type'),''), NULLIF(btrim(v_item->>'notes'),''), p_actor_profile_id)
    ON CONFLICT (farm_id, name) DO NOTHING;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_farm_assets, '[]')) LOOP
    INSERT INTO public.farm_assets (farm_id, name, asset_type, identification, manufacturer, model, model_year,
      acquisition_date, acquisition_value, current_meter, meter_unit, location_description, notes, created_by)
    VALUES (v_farm_id, btrim(v_item->>'name'), v_item->>'asset_type', NULLIF(btrim(v_item->>'identification'),''),
      NULLIF(btrim(v_item->>'manufacturer'),''), NULLIF(btrim(v_item->>'model'),''), NULLIF(v_item->>'model_year','')::INTEGER,
      NULLIF(v_item->>'acquisition_date','')::DATE, NULLIF(v_item->>'acquisition_value','')::NUMERIC,
      NULLIF(v_item->>'current_meter','')::NUMERIC, NULLIF(btrim(v_item->>'meter_unit'),''),
      NULLIF(btrim(v_item->>'location_description'),''), NULLIF(btrim(v_item->>'notes'),''), p_actor_profile_id);
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_rural_contracts, '[]')) LOOP
    PERFORM public.insert_rural_contract(v_farm_id, v_item, p_actor_profile_id);
  END LOOP;
  RETURN v_farm_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.farm_event_visibility(p_table_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_table_name = ANY (ARRAY[
    'expenses','revenues','employee_payments','cattle_sales','sales','ai_strategic_reports','ai_strategic_insights',
    'autopilot_findings','farm_goals','planning_scenarios','rural_contracts','rural_contract_installments'
  ]) THEN 'restricted' ELSE 'standard' END;
$$;

ALTER TABLE public.land_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agricultural_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rural_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rural_contract_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read land parcels" ON public.land_parcels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read agricultural fields" ON public.agricultural_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read farm assets" ON public.farm_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers can read rural contracts" ON public.rural_contracts FOR SELECT TO authenticated USING (public.can_read_restricted_farm_data());
CREATE POLICY "Managers can read rural installments" ON public.rural_contract_installments FOR SELECT TO authenticated USING (public.can_read_restricted_farm_data());

REVOKE ALL ON public.land_parcels, public.agricultural_fields, public.farm_assets, public.rural_contracts, public.rural_contract_installments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.land_parcels, public.agricultural_fields, public.farm_assets, public.rural_contracts, public.rural_contract_installments TO authenticated;
GRANT ALL ON public.land_parcels, public.agricultural_fields, public.farm_assets, public.rural_contracts, public.rural_contract_installments TO service_role;
REVOKE ALL ON FUNCTION public.insert_rural_contract(UUID, JSONB, UUID), public.receive_rural_contract_installment(UUID, DATE, UUID),
  public.execute_rural_contract_pending_action(UUID, TEXT, JSONB, UUID, TEXT),
  public.configure_farm_foundation_v2_transactional(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_rural_contract(UUID, JSONB, UUID), public.receive_rural_contract_installment(UUID, DATE, UUID),
  public.execute_rural_contract_pending_action(UUID, TEXT, JSONB, UUID, TEXT),
  public.configure_farm_foundation_v2_transactional(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, UUID)
  TO service_role;

DO $$ DECLARE v_table TEXT; BEGIN
  FOREACH v_table IN ARRAY ARRAY['land_parcels','agricultural_fields','farm_assets','rural_contracts','rural_contract_installments'] LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', v_table, v_table);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()', v_table, v_table);
    EXECUTE format('CREATE TRIGGER capture_farm_twin_event AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_farm_domain_event()', v_table);
    EXECUTE format('CREATE TRIGGER prevent_delete_%I BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete()', v_table, v_table);
  END LOOP;
END $$;
CREATE TRIGGER sync_rural_contract_alert AFTER INSERT OR UPDATE ON public.rural_contracts FOR EACH ROW EXECUTE FUNCTION public.sync_rural_contract_alert();
CREATE TRIGGER sync_rural_installment_alert AFTER INSERT OR UPDATE ON public.rural_contract_installments FOR EACH ROW EXECUTE FUNCTION public.sync_rural_installment_alert();

COMMENT ON TABLE public.rural_contracts IS 'Contratos agrários estruturados; arrendamento, parceria e comodato permanecem juridicamente distintos.';
COMMENT ON FUNCTION public.insert_rural_contract(UUID, JSONB, UUID) IS 'Cria contrato, área vinculada, cronograma e alertas em uma única transação.';

COMMIT;

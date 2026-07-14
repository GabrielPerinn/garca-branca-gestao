-- A single managed livestock operation may contain many physical rural
-- properties. Properties are land_parcels; pastures belong to one property and
-- all operational/financial indicators remain consolidated at operation level.

BEGIN;

DROP INDEX IF EXISTS public.uq_single_active_farm;
CREATE UNIQUE INDEX uq_single_active_livestock_operation
  ON public.farms ((1))
  WHERE COALESCE(status, 'active') <> 'deleted';

COMMENT ON TABLE public.farms IS
  'Operação pecuária consolidada administrada pelo sistema; as propriedades físicas ficam em land_parcels.';
COMMENT ON INDEX public.uq_single_active_livestock_operation IS
  'Mantém uma operação pecuária consolidada, que pode conter múltiplas propriedades rurais.';

ALTER TABLE public.pastures
  ADD COLUMN IF NOT EXISTS land_parcel_id UUID REFERENCES public.land_parcels(id) ON DELETE RESTRICT;

ALTER TABLE public.farm_assets
  ADD COLUMN IF NOT EXISTS land_parcel_id UUID REFERENCES public.land_parcels(id) ON DELETE RESTRICT;

CREATE INDEX idx_pastures_property_active
  ON public.pastures (land_parcel_id, status, name);
CREATE INDEX idx_farm_assets_property_active
  ON public.farm_assets (land_parcel_id, status, name);

-- Existing installations with exactly one property can be linked safely.
WITH single_property AS (
  SELECT farm_id, min(id::TEXT)::UUID AS property_id
  FROM public.land_parcels
  WHERE status <> 'deleted'
  GROUP BY farm_id
  HAVING count(*) = 1
)
UPDATE public.pastures pasture
SET land_parcel_id = single_property.property_id
FROM single_property
WHERE pasture.farm_id = single_property.farm_id
  AND pasture.land_parcel_id IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_property_operation_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation_id UUID := NULLIF(to_jsonb(NEW)->>TG_ARGV[0], '')::UUID;
  v_property_id UUID := NULLIF(to_jsonb(NEW)->>TG_ARGV[1], '')::UUID;
BEGIN
  IF v_property_id IS NULL THEN RETURN NEW; END IF;
  IF v_operation_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.land_parcels
    WHERE id = v_property_id AND farm_id = v_operation_id AND status <> 'deleted'
  ) THEN
    RAISE EXCEPTION 'A propriedade informada não pertence a esta operação pecuária.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_pasture_property_scope
  BEFORE INSERT OR UPDATE OF farm_id, land_parcel_id ON public.pastures
  FOR EACH ROW EXECUTE FUNCTION public.enforce_property_operation_scope('farm_id', 'land_parcel_id');

CREATE TRIGGER enforce_asset_property_scope
  BEFORE INSERT OR UPDATE OF farm_id, land_parcel_id ON public.farm_assets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_property_operation_scope('farm_id', 'land_parcel_id');

CREATE OR REPLACE FUNCTION public.configure_livestock_operation_foundation_transactional(
  p_operation_id UUID,
  p_profile JSONB,
  p_pastures JSONB,
  p_cattle_lots JSONB,
  p_employees JSONB,
  p_inventory_items JSONB,
  p_properties JSONB,
  p_farm_assets JSONB,
  p_rural_contracts JSONB,
  p_actor_profile_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation_id UUID;
  v_pasture JSONB;
  v_asset JSONB;
  v_property_id UUID;
  v_property_name TEXT;
  v_total_area NUMERIC;
  v_usable_area NUMERIC;
BEGIN
  IF jsonb_typeof(COALESCE(p_properties, '[]')) <> 'array'
    OR jsonb_typeof(COALESCE(p_pastures, '[]')) <> 'array' THEN
    RAISE EXCEPTION 'Propriedades e pastos devem ser listas válidas.' USING ERRCODE = '22023';
  END IF;

  IF p_operation_id IS NULL
    AND jsonb_array_length(COALESCE(p_properties, '[]')) = 0 THEN
    RAISE EXCEPTION 'Cadastre ao menos uma propriedade rural na operação pecuária.' USING ERRCODE = '22023';
  END IF;

  FOR v_pasture IN SELECT value FROM jsonb_array_elements(COALESCE(p_pastures, '[]')) LOOP
    v_property_name := NULLIF(btrim(v_pasture->>'property_name'), '');
    IF v_property_name IS NULL THEN
      RAISE EXCEPTION 'Todo pasto precisa indicar a propriedade onde está localizado.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_properties, '[]')) property
      WHERE lower(btrim(property->>'name')) = lower(v_property_name)
    ) AND NOT EXISTS (
      SELECT 1 FROM public.land_parcels
      WHERE farm_id = p_operation_id AND lower(name) = lower(v_property_name) AND status <> 'deleted'
    ) THEN
      RAISE EXCEPTION 'Propriedade do pasto não encontrada: %', v_property_name USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  FOR v_asset IN SELECT value FROM jsonb_array_elements(COALESCE(p_farm_assets, '[]')) LOOP
    v_property_name := NULLIF(btrim(v_asset->>'property_name'), '');
    IF v_property_name IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_properties, '[]')) property
      WHERE lower(btrim(property->>'name')) = lower(v_property_name)
    ) AND NOT EXISTS (
      SELECT 1 FROM public.land_parcels
      WHERE farm_id = p_operation_id AND lower(name) = lower(v_property_name) AND status <> 'deleted'
    ) THEN
      RAISE EXCEPTION 'Propriedade do ativo não encontrada: %', v_property_name USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  v_operation_id := public.configure_farm_foundation_v2_transactional(
    p_operation_id, p_profile, p_pastures, p_cattle_lots, p_employees,
    p_inventory_items, p_properties, '[]'::JSONB, p_farm_assets,
    p_rural_contracts, p_actor_profile_id
  );

  FOR v_pasture IN SELECT value FROM jsonb_array_elements(COALESCE(p_pastures, '[]')) LOOP
    v_property_name := btrim(v_pasture->>'property_name');
    SELECT id INTO v_property_id
    FROM public.land_parcels
    WHERE farm_id = v_operation_id AND lower(name) = lower(v_property_name) AND status <> 'deleted'
    LIMIT 1;
    IF v_property_id IS NULL THEN
      RAISE EXCEPTION 'Não foi possível vincular o pasto à propriedade: %', v_property_name USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.pastures
    SET land_parcel_id = v_property_id
    WHERE farm_id = v_operation_id
      AND lower(name) = lower(btrim(v_pasture->>'name'))
      AND status <> 'deleted';
  END LOOP;

  FOR v_asset IN SELECT value FROM jsonb_array_elements(COALESCE(p_farm_assets, '[]')) LOOP
    v_property_name := NULLIF(btrim(v_asset->>'property_name'), '');
    IF v_property_name IS NULL THEN CONTINUE; END IF;
    SELECT id INTO v_property_id
    FROM public.land_parcels
    WHERE farm_id = v_operation_id AND lower(name) = lower(v_property_name) AND status <> 'deleted'
    LIMIT 1;
    UPDATE public.farm_assets
    SET land_parcel_id = v_property_id
    WHERE farm_id = v_operation_id
      AND lower(name) = lower(btrim(v_asset->>'name'))
      AND land_parcel_id IS NULL
      AND status <> 'deleted';
  END LOOP;

  SELECT
    COALESCE(sum(total_area_ha), 0),
    CASE WHEN count(*) > 0 AND count(usable_area_ha) = count(*) THEN sum(usable_area_ha) ELSE NULL END
  INTO v_total_area, v_usable_area
  FROM public.land_parcels
  WHERE farm_id = v_operation_id AND status <> 'deleted';

  UPDATE public.farms
  SET total_area_ha = v_total_area,
      productive_area_ha = COALESCE(v_usable_area, productive_area_ha),
      updated_at = clock_timestamp()
  WHERE id = v_operation_id;

  RETURN v_operation_id;
END;
$$;

-- Keep the digital twin aware of the physical property that contains each
-- pasture, asset or contract while retaining the consolidated operation link.
CREATE OR REPLACE FUNCTION public.sync_farm_entity_relations(
  p_farm_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_state JSONB,
  p_event_id UUID,
  p_occurred_at TIMESTAMPTZ,
  p_visibility TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mapping JSONB;
  v_target_id UUID;
  v_target_type TEXT;
  v_relation_type TEXT;
  v_current_keys TEXT[] := ARRAY[]::TEXT[];
  v_key TEXT;
  v_related_table TEXT;
BEGIN
  FOR v_mapping IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('field', 'farm_id', 'target', 'farms', 'relation', 'belongs_to_farm'),
    jsonb_build_object('field', 'related_farm_id', 'target', 'farms', 'relation', 'belongs_to_farm'),
    jsonb_build_object('field', 'land_parcel_id', 'target', 'land_parcels', 'relation', 'located_in_property'),
    jsonb_build_object('field', 'area_id', 'target', 'areas', 'relation', 'belongs_to_area'),
    jsonb_build_object('field', 'pasture_id', 'target', 'pastures', 'relation', 'located_in_pasture'),
    jsonb_build_object('field', 'related_pasture_id', 'target', 'pastures', 'relation', 'related_to_pasture'),
    jsonb_build_object('field', 'cattle_lot_id', 'target', 'cattle_lots', 'relation', 'belongs_to_cattle_lot'),
    jsonb_build_object('field', 'related_cattle_lot_id', 'target', 'cattle_lots', 'relation', 'related_to_cattle_lot'),
    jsonb_build_object('field', 'employee_id', 'target', 'employees', 'relation', 'belongs_to_employee'),
    jsonb_build_object('field', 'assigned_to_employee_id', 'target', 'employees', 'relation', 'assigned_to_employee'),
    jsonb_build_object('field', 'related_employee_id', 'target', 'employees', 'relation', 'related_to_employee'),
    jsonb_build_object('field', 'inventory_item_id', 'target', 'inventory_items', 'relation', 'belongs_to_inventory_item'),
    jsonb_build_object('field', 'related_inventory_item_id', 'target', 'inventory_items', 'relation', 'related_to_inventory_item'),
    jsonb_build_object('field', 'related_task_id', 'target', 'tasks', 'relation', 'related_to_task'),
    jsonb_build_object('field', 'related_sale_id', 'target', 'cattle_sales', 'relation', 'related_to_sale'),
    jsonb_build_object('field', 'related_expense_id', 'target', 'expenses', 'relation', 'related_to_expense'),
    jsonb_build_object('field', 'document_id', 'target', 'documents', 'relation', 'supported_by_document'),
    jsonb_build_object('field', 'report_id', 'target', 'ai_strategic_reports', 'relation', 'belongs_to_report'),
    jsonb_build_object('field', 'pending_action_id', 'target', 'pending_actions', 'relation', 'originated_pending_action'),
    jsonb_build_object('field', 'from_farm_id', 'target', 'farms', 'relation', 'moved_from_farm'),
    jsonb_build_object('field', 'to_farm_id', 'target', 'farms', 'relation', 'moved_to_farm'),
    jsonb_build_object('field', 'from_pasture_id', 'target', 'pastures', 'relation', 'moved_from_pasture'),
    jsonb_build_object('field', 'to_pasture_id', 'target', 'pastures', 'relation', 'moved_to_pasture')
  )) LOOP
    v_target_id := public.try_uuid(p_state->>(v_mapping->>'field'));
    IF v_target_id IS NULL THEN CONTINUE; END IF;
    v_target_type := v_mapping->>'target';
    v_relation_type := v_mapping->>'relation';
    IF v_target_type = p_entity_type AND v_target_id = p_entity_id THEN CONTINUE; END IF;
    v_key := v_relation_type || '|' || v_target_type || '|' || v_target_id::TEXT;
    v_current_keys := array_append(v_current_keys, v_key);
    INSERT INTO public.farm_entity_relations (
      farm_id, from_entity_type, from_entity_id, relation_type,
      to_entity_type, to_entity_id, visibility, valid_from, source_event_id
    ) VALUES (
      p_farm_id, p_entity_type, p_entity_id, v_relation_type,
      v_target_type, v_target_id, p_visibility, p_occurred_at, p_event_id
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  v_related_table := NULLIF(p_state->>'related_table', '');
  v_target_id := public.try_uuid(p_state->>'related_id');
  IF v_related_table ~ '^[a-z][a-z0-9_]{1,62}$' AND v_target_id IS NOT NULL THEN
    v_key := 'related_to|' || v_related_table || '|' || v_target_id::TEXT;
    v_current_keys := array_append(v_current_keys, v_key);
    INSERT INTO public.farm_entity_relations (
      farm_id, from_entity_type, from_entity_id, relation_type,
      to_entity_type, to_entity_id, visibility, valid_from, source_event_id
    ) VALUES (
      p_farm_id, p_entity_type, p_entity_id, 'related_to',
      v_related_table, v_target_id, p_visibility, p_occurred_at, p_event_id
    ) ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.farm_entity_relations AS relation
  SET valid_to = GREATEST(p_occurred_at, relation.valid_from)
  WHERE relation.from_entity_type = p_entity_type
    AND relation.from_entity_id = p_entity_id
    AND relation.valid_to IS NULL
    AND NOT ((relation.relation_type || '|' || relation.to_entity_type || '|' || relation.to_entity_id::TEXT) = ANY(v_current_keys));
END;
$$;

REVOKE ALL ON FUNCTION public.configure_livestock_operation_foundation_transactional(
  UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_livestock_operation_foundation_transactional(
  UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, UUID
) TO service_role;

COMMENT ON COLUMN public.pastures.land_parcel_id IS
  'Propriedade física onde o pasto está localizado.';
COMMENT ON FUNCTION public.configure_livestock_operation_foundation_transactional(
  UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, UUID
) IS 'Implanta uma operação pecuária com múltiplas propriedades e vincula cada pasto à localização correta.';

COMMIT;

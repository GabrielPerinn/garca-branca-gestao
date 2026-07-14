-- Garca Twin: temporal, tamper-evident operational history and entity graph.
-- Domain tables remain the transactional source of truth. This ledger is an
-- immutable history and the entity/relation tables are read-optimized indexes.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.farm_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  display_name TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  visibility TEXT NOT NULL DEFAULT 'standard',
  current_version INTEGER NOT NULL DEFAULT 1,
  current_state JSONB NOT NULL DEFAULT '{}'::JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_event_at TIMESTAMPTZ NOT NULL,
  last_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT farm_entities_identity_unique UNIQUE (entity_type, entity_id),
  CONSTRAINT farm_entities_version_positive CHECK (current_version > 0),
  CONSTRAINT farm_entities_visibility_valid CHECK (visibility IN ('standard', 'restricted'))
);

CREATE TABLE IF NOT EXISTS public.farm_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_display_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_sequence INTEGER NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'standard',
  occurred_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  actor_profile_id UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  source_message_id TEXT,
  source_channel TEXT NOT NULL DEFAULT 'system',
  correlation_id UUID,
  causation_event_id UUID REFERENCES public.farm_events(id) ON DELETE RESTRICT,
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  CONSTRAINT farm_events_entity_sequence_unique UNIQUE (entity_type, entity_id, event_sequence),
  CONSTRAINT farm_events_sequence_positive CHECK (event_sequence > 0),
  CONSTRAINT farm_events_visibility_valid CHECK (visibility IN ('standard', 'restricted')),
  CONSTRAINT farm_events_hash_format CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT farm_events_previous_hash_format CHECK (
    previous_event_hash IS NULL OR previous_event_hash ~ '^[0-9a-f]{64}$'
  )
);

ALTER TABLE public.farm_entities
  ADD CONSTRAINT farm_entities_last_event_fk
  FOREIGN KEY (last_event_id) REFERENCES public.farm_events(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.farm_entity_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  from_entity_type TEXT NOT NULL,
  from_entity_id UUID NOT NULL,
  relation_type TEXT NOT NULL,
  to_entity_type TEXT NOT NULL,
  to_entity_id UUID NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'standard',
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  source_event_id UUID NOT NULL REFERENCES public.farm_events(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT farm_entity_relations_period_valid CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT farm_entity_relations_visibility_valid CHECK (visibility IN ('standard', 'restricted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_farm_entity_relations_active
  ON public.farm_entity_relations (
    from_entity_type, from_entity_id, relation_type, to_entity_type, to_entity_id
  ) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_farm_entities_farm_type
  ON public.farm_entities (farm_id, entity_type, lifecycle_status, last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_farm_events_farm_timeline
  ON public.farm_events (farm_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_farm_events_entity_timeline
  ON public.farm_events (entity_type, entity_id, event_sequence DESC);
CREATE INDEX IF NOT EXISTS idx_farm_events_actor
  ON public.farm_events (actor_profile_id, occurred_at DESC)
  WHERE actor_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_farm_events_correlation
  ON public.farm_events (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_farm_entity_relations_from
  ON public.farm_entity_relations (farm_id, from_entity_type, from_entity_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_farm_entity_relations_to
  ON public.farm_entity_relations (farm_id, to_entity_type, to_entity_id, valid_from DESC);

CREATE OR REPLACE FUNCTION public.try_uuid(p_value TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN p_value::UUID;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_actor_profile_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id UUID;
  v_headers JSONB;
  v_header_value TEXT;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::JSONB;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  v_header_value := v_headers->>'x-actor-profile-id';
  IF public.try_uuid(v_header_value) IS NOT NULL THEN
    SELECT profile.id INTO v_profile_id
    FROM public.users_profiles AS profile
    WHERE profile.id = public.try_uuid(v_header_value) AND profile.is_active = true
    LIMIT 1;
  END IF;

  IF v_profile_id IS NULL THEN
    SELECT profile.id INTO v_profile_id
    FROM public.users_profiles AS profile
    WHERE profile.user_id = auth.uid() AND profile.is_active = true
    LIMIT 1;
  END IF;

  RETURN v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_restricted_farm_data()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users_profiles AS profile
    WHERE profile.user_id = auth.uid()
      AND profile.is_active = true
      AND lower(profile.role) IN ('owner', 'admin', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.farm_event_visibility(p_table_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_table_name = ANY (ARRAY[
      'expenses', 'revenues', 'employee_payments', 'cattle_sales', 'sales',
      'ai_strategic_reports', 'ai_strategic_insights'
    ]) THEN 'restricted'
    ELSE 'standard'
  END;
$$;

CREATE OR REPLACE FUNCTION public.sanitize_farm_event_state(p_table_name TEXT, p_state JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p_state IS NULL THEN NULL ELSE
    p_state - ARRAY[
      'raw_payload_json', 'text_content', 'sender_phone', 'phone_number',
      'file_url', 'storage_path', 'transcription', 'media_url', 'notes',
      'salary_amount', 'owner_name', 'owner_phone', 'document_number',
      'address', 'postal_code'
    ]::TEXT[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_farm_event_farm_id(p_table_name TEXT, p_state JSONB)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_farm_id UUID;
  v_related_id UUID;
BEGIN
  IF p_table_name IS NULL OR p_table_name !~ '^[a-z][a-z0-9_]{1,62}$' THEN
    RETURN NULL;
  END IF;

  v_farm_id := COALESCE(
    public.try_uuid(p_state->>'farm_id'),
    public.try_uuid(p_state->>'related_farm_id'),
    public.try_uuid(p_state->>'to_farm_id'),
    public.try_uuid(p_state->>'from_farm_id')
  );
  IF v_farm_id IS NOT NULL THEN RETURN v_farm_id; END IF;

  v_related_id := COALESCE(public.try_uuid(p_state->>'cattle_lot_id'), public.try_uuid(p_state->>'related_cattle_lot_id'));
  IF v_related_id IS NOT NULL THEN
    SELECT farm_id INTO v_farm_id FROM public.cattle_lots WHERE id = v_related_id;
  END IF;

  IF v_farm_id IS NULL THEN
    v_related_id := COALESCE(public.try_uuid(p_state->>'pasture_id'), public.try_uuid(p_state->>'related_pasture_id'));
    IF v_related_id IS NOT NULL THEN
      SELECT farm_id INTO v_farm_id FROM public.pastures WHERE id = v_related_id;
    END IF;
  END IF;

  IF v_farm_id IS NULL THEN
    v_related_id := public.try_uuid(p_state->>'area_id');
    IF v_related_id IS NOT NULL THEN
      SELECT farm_id INTO v_farm_id FROM public.areas WHERE id = v_related_id;
    END IF;
  END IF;

  IF v_farm_id IS NULL THEN
    v_related_id := COALESCE(public.try_uuid(p_state->>'employee_id'), public.try_uuid(p_state->>'related_employee_id'));
    IF v_related_id IS NOT NULL THEN
      SELECT farm_id INTO v_farm_id FROM public.employees WHERE id = v_related_id;
    END IF;
  END IF;

  IF v_farm_id IS NULL THEN
    v_related_id := COALESCE(public.try_uuid(p_state->>'inventory_item_id'), public.try_uuid(p_state->>'related_inventory_item_id'));
    IF v_related_id IS NOT NULL THEN
      SELECT farm_id INTO v_farm_id FROM public.inventory_items WHERE id = v_related_id;
    END IF;
  END IF;

  IF v_farm_id IS NULL THEN
    v_related_id := public.try_uuid(p_state->>'report_id');
    IF v_related_id IS NOT NULL THEN
      SELECT farm_id INTO v_farm_id FROM public.ai_strategic_reports WHERE id = v_related_id;
    END IF;
  END IF;

  IF v_farm_id IS NULL THEN
    SELECT farm.id INTO v_farm_id
    FROM public.farms AS farm
    WHERE COALESCE(farm.status, 'active') <> 'deleted'
    ORDER BY farm.created_at, farm.id
    LIMIT 1;
  END IF;

  RETURN v_farm_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.farm_entity_display_name(p_table_name TEXT, p_state JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label TEXT;
BEGIN
  v_label := COALESCE(
    NULLIF(btrim(p_state->>'name'), ''),
    NULLIF(btrim(p_state->>'title'), ''),
    NULLIF(btrim(p_state->>'full_name'), ''),
    NULLIF(btrim(p_state->>'asset_name'), ''),
    NULLIF(btrim(p_state->>'buyer_name'), ''),
    NULLIF(btrim(p_state->>'description'), '')
  );
  RETURN COALESCE(v_label, initcap(replace(p_table_name, '_', ' ')) || ' ' || left(COALESCE(p_state->>'id', ''), 8));
END;
$$;

CREATE OR REPLACE FUNCTION public.farm_event_semantic_type(
  p_table_name TEXT,
  p_operation TEXT,
  p_before JSONB,
  p_after JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_status TEXT := COALESCE(p_before->>'status', '');
  v_new_status TEXT := COALESCE(p_after->>'status', '');
BEGIN
  IF p_operation = 'BACKFILL' THEN RETURN 'baseline_imported'; END IF;
  IF p_operation = 'INSERT' THEN
    RETURN CASE p_table_name
      WHEN 'cattle_movements' THEN 'livestock_movement_recorded'
      WHEN 'weighings' THEN 'weighing_recorded'
      WHEN 'cattle_sales' THEN 'livestock_sale_recorded'
      WHEN 'expenses' THEN 'expense_recorded'
      WHEN 'revenues' THEN 'revenue_recorded'
      WHEN 'inventory_movements' THEN 'inventory_movement_recorded'
      WHEN 'employee_payments' THEN 'employee_payment_recorded'
      WHEN 'maintenance_records' THEN 'maintenance_recorded'
      WHEN 'tasks' THEN 'task_created'
      ELSE 'entity_created'
    END;
  END IF;
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    IF v_new_status = 'deleted' THEN RETURN 'entity_deleted'; END IF;
    IF v_old_status = 'deleted' THEN RETURN 'entity_restored'; END IF;
    IF p_table_name = 'tasks' AND v_new_status = 'completed' THEN RETURN 'task_completed'; END IF;
    RETURN 'status_changed';
  END IF;
  RETURN 'entity_updated';
END;
$$;

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

CREATE OR REPLACE FUNCTION public.append_farm_event(
  p_table_name TEXT,
  p_record_id UUID,
  p_operation TEXT,
  p_before JSONB,
  p_after JSONB,
  p_occurred_at TIMESTAMPTZ DEFAULT clock_timestamp(),
  p_actor_profile_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_farm_id UUID;
  v_before JSONB;
  v_after JSONB;
  v_changed_fields TEXT[];
  v_display_name TEXT;
  v_event_type TEXT;
  v_event_id UUID := gen_random_uuid();
  v_previous_hash TEXT;
  v_sequence INTEGER;
  v_event_hash TEXT;
  v_visibility TEXT;
  v_source_message_id TEXT;
  v_source_channel TEXT;
  v_status TEXT;
BEGIN
  IF p_record_id IS NULL OR p_after IS NULL THEN RETURN NULL; END IF;

  v_farm_id := public.resolve_farm_event_farm_id(p_table_name, p_after);
  IF v_farm_id IS NULL THEN RETURN NULL; END IF;

  v_before := public.sanitize_farm_event_state(p_table_name, p_before);
  v_after := public.sanitize_farm_event_state(p_table_name, p_after);

  IF p_operation = 'UPDATE' THEN
    SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::TEXT[]) INTO v_changed_fields
    FROM (
      SELECT key
      FROM jsonb_object_keys(COALESCE(v_before, '{}'::JSONB) || COALESCE(v_after, '{}'::JSONB)) AS keys(key)
      WHERE key <> 'updated_at' AND (v_before->key) IS DISTINCT FROM (v_after->key)
    ) AS changed;
    IF cardinality(v_changed_fields) = 0 THEN RETURN NULL; END IF;
  ELSE
    SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::TEXT[]) INTO v_changed_fields
    FROM jsonb_object_keys(COALESCE(v_after, '{}'::JSONB)) AS keys(key)
    WHERE key <> 'updated_at';
  END IF;

  v_display_name := public.farm_entity_display_name(p_table_name, v_after);
  v_event_type := public.farm_event_semantic_type(p_table_name, p_operation, v_before, v_after);
  v_visibility := public.farm_event_visibility(p_table_name);
  v_source_message_id := NULLIF(p_after->>'source_message_id', '');
  v_source_channel := CASE
    WHEN p_operation = 'BACKFILL' THEN 'migration'
    WHEN v_source_message_id IS NOT NULL THEN 'ai_or_whatsapp'
    WHEN p_actor_profile_id IS NOT NULL OR public.current_actor_profile_id() IS NOT NULL THEN 'web'
    ELSE 'system'
  END;
  v_status := COALESCE(NULLIF(v_after->>'status', ''), 'active');

  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_name || ':' || p_record_id::TEXT, 0));
  SELECT event.event_sequence, event.event_hash
    INTO v_sequence, v_previous_hash
  FROM public.farm_events AS event
  WHERE event.entity_type = p_table_name AND event.entity_id = p_record_id
  ORDER BY event.event_sequence DESC
  LIMIT 1;
  v_sequence := COALESCE(v_sequence, 0) + 1;

  v_event_hash := encode(extensions.digest(convert_to(concat_ws('|',
    v_event_id::TEXT, v_farm_id::TEXT, p_table_name, p_record_id::TEXT,
    v_event_type, v_sequence::TEXT, p_occurred_at::TEXT,
    COALESCE(v_previous_hash, ''), COALESCE(v_before::TEXT, ''), COALESCE(v_after::TEXT, '')
  ), 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.farm_events (
    id, farm_id, entity_type, entity_id, entity_display_name, event_type,
    event_sequence, visibility, occurred_at, actor_profile_id, source_message_id,
    source_channel, changed_fields, before_state, after_state, metadata,
    previous_event_hash, event_hash
  ) VALUES (
    v_event_id, v_farm_id, p_table_name, p_record_id, v_display_name, v_event_type,
    v_sequence, v_visibility, p_occurred_at,
    COALESCE(p_actor_profile_id, public.current_actor_profile_id()), v_source_message_id,
    v_source_channel, v_changed_fields, v_before, v_after, COALESCE(p_metadata, '{}'::JSONB),
    v_previous_hash, v_event_hash
  );

  INSERT INTO public.farm_entities (
    farm_id, entity_type, entity_id, display_name, lifecycle_status, visibility,
    current_version, current_state, first_seen_at, last_event_at, last_event_id
  ) VALUES (
    v_farm_id, p_table_name, p_record_id, v_display_name, v_status, v_visibility,
    v_sequence, v_after, p_occurred_at, p_occurred_at, v_event_id
  )
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    farm_id = EXCLUDED.farm_id,
    display_name = EXCLUDED.display_name,
    lifecycle_status = EXCLUDED.lifecycle_status,
    visibility = EXCLUDED.visibility,
    current_version = EXCLUDED.current_version,
    current_state = EXCLUDED.current_state,
    last_event_at = EXCLUDED.last_event_at,
    last_event_id = EXCLUDED.last_event_id,
    updated_at = clock_timestamp();

  PERFORM public.sync_farm_entity_relations(
    v_farm_id, p_table_name, p_record_id, p_after, v_event_id,
    p_occurred_at, v_visibility
  );

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_farm_domain_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before JSONB;
  v_after JSONB;
  v_occurred_at TIMESTAMPTZ;
BEGIN
  v_before := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_after := to_jsonb(NEW);
  BEGIN
    v_occurred_at := COALESCE(NULLIF(v_after->>'updated_at', '')::TIMESTAMPTZ, clock_timestamp());
  EXCEPTION WHEN OTHERS THEN
    v_occurred_at := clock_timestamp();
  END;

  PERFORM public.append_farm_event(
    TG_TABLE_NAME,
    public.try_uuid(v_after->>'id'),
    TG_OP,
    v_before,
    v_after,
    v_occurred_at,
    public.current_actor_profile_id(),
    jsonb_build_object('capture', 'database_trigger')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_farm_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'O livro de eventos do Garça Twin é imutável.' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_farm_event_chain(p_farm_id UUID DEFAULT NULL)
RETURNS TABLE (
  checked_events BIGINT,
  invalid_events BIGINT,
  is_valid BOOLEAN,
  checked_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ordered AS (
    SELECT event.*,
      lag(event.event_hash) OVER (
        PARTITION BY event.entity_type, event.entity_id ORDER BY event.event_sequence
      ) AS expected_previous_hash
    FROM public.farm_events AS event
    WHERE p_farm_id IS NULL OR event.farm_id = p_farm_id
  ), verified AS (
    SELECT *,
      encode(extensions.digest(convert_to(concat_ws('|',
        id::TEXT, farm_id::TEXT, entity_type, entity_id::TEXT,
        event_type, event_sequence::TEXT, occurred_at::TEXT,
        COALESCE(previous_event_hash, ''), COALESCE(before_state::TEXT, ''), COALESCE(after_state::TEXT, '')
      ), 'UTF8'), 'sha256'), 'hex') AS expected_hash
    FROM ordered
  )
  SELECT count(*)::BIGINT,
    count(*) FILTER (WHERE previous_event_hash IS DISTINCT FROM expected_previous_hash OR event_hash <> expected_hash)::BIGINT,
    count(*) FILTER (WHERE previous_event_hash IS DISTINCT FROM expected_previous_hash OR event_hash <> expected_hash) = 0,
    clock_timestamp()
  FROM verified;
$$;

CREATE OR REPLACE FUNCTION public.get_farm_twin_overview(p_farm_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH selected_farm AS (
    SELECT COALESCE(p_farm_id, (
      SELECT farm.id FROM public.farms AS farm
      WHERE COALESCE(farm.status, 'active') <> 'deleted'
      ORDER BY farm.created_at, farm.id LIMIT 1
    )) AS id
  ), entity_counts AS (
    SELECT entity.entity_type, count(*)::INTEGER AS quantity
    FROM public.farm_entities AS entity, selected_farm
    WHERE entity.farm_id = selected_farm.id AND entity.lifecycle_status <> 'deleted'
      AND (entity.visibility = 'standard' OR public.can_read_restricted_farm_data())
    GROUP BY entity.entity_type
  ), totals AS (
    SELECT
      (SELECT count(*) FROM public.farm_entities AS entity, selected_farm WHERE entity.farm_id = selected_farm.id AND (entity.visibility = 'standard' OR public.can_read_restricted_farm_data())) AS entities,
      (SELECT count(*) FROM public.farm_events AS event, selected_farm WHERE event.farm_id = selected_farm.id AND (event.visibility = 'standard' OR public.can_read_restricted_farm_data())) AS events,
      (SELECT count(*) FROM public.farm_entity_relations AS relation, selected_farm WHERE relation.farm_id = selected_farm.id AND relation.valid_to IS NULL AND (relation.visibility = 'standard' OR public.can_read_restricted_farm_data())) AS relations,
      (SELECT max(event.occurred_at) FROM public.farm_events AS event, selected_farm WHERE event.farm_id = selected_farm.id AND (event.visibility = 'standard' OR public.can_read_restricted_farm_data())) AS last_event_at
  )
  SELECT jsonb_build_object(
    'farm_id', selected_farm.id,
    'entity_count', totals.entities,
    'event_count', totals.events,
    'active_relation_count', totals.relations,
    'last_event_at', totals.last_event_at,
    'entities_by_type', COALESCE((SELECT jsonb_object_agg(entity_type, quantity) FROM entity_counts), '{}'::JSONB)
  )
  FROM selected_farm, totals;
$$;

ALTER TABLE public.farm_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_entity_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can read farm entities" ON public.farm_entities;
CREATE POLICY "Authorized users can read farm entities"
  ON public.farm_entities FOR SELECT TO authenticated
  USING (visibility = 'standard' OR public.can_read_restricted_farm_data());
DROP POLICY IF EXISTS "Authorized users can read farm events" ON public.farm_events;
CREATE POLICY "Authorized users can read farm events"
  ON public.farm_events FOR SELECT TO authenticated
  USING (visibility = 'standard' OR public.can_read_restricted_farm_data());
DROP POLICY IF EXISTS "Authorized users can read farm relations" ON public.farm_entity_relations;
CREATE POLICY "Authorized users can read farm relations"
  ON public.farm_entity_relations FOR SELECT TO authenticated
  USING (visibility = 'standard' OR public.can_read_restricted_farm_data());

REVOKE ALL ON public.farm_entities, public.farm_events, public.farm_entity_relations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.farm_entities, public.farm_events, public.farm_entity_relations TO authenticated;
GRANT ALL ON public.farm_entities, public.farm_events, public.farm_entity_relations TO service_role;

REVOKE ALL ON FUNCTION public.try_uuid(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_actor_profile_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_read_restricted_farm_data() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.farm_event_visibility(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sanitize_farm_event_state(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_farm_event_farm_id(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.farm_entity_display_name(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.farm_event_semantic_type(TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_farm_entity_relations(UUID, TEXT, UUID, JSONB, UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.append_farm_event(TEXT, UUID, TEXT, JSONB, JSONB, TIMESTAMPTZ, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_farm_domain_event() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_uuid(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_restricted_farm_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_farm_event_chain(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_farm_twin_overview(UUID) TO authenticated, service_role;

DROP TRIGGER IF EXISTS prevent_farm_events_update ON public.farm_events;
CREATE TRIGGER prevent_farm_events_update BEFORE UPDATE OR DELETE ON public.farm_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_farm_event_mutation();

DO $$
DECLARE
  v_table TEXT;
  v_record RECORD;
  v_occurred_at TIMESTAMPTZ;
  v_tables CONSTANT TEXT[] := ARRAY[
    'farms', 'areas', 'pastures', 'cattle_lots', 'cattle_movements', 'weighings',
    'cattle_sales', 'sales', 'employees', 'employee_payments', 'inventory_items',
    'inventory_movements', 'tasks', 'expenses', 'revenues', 'alerts', 'documents',
    'gravel_operations', 'suppression_operations', 'maintenance_records', 'occurrences',
    'ai_strategic_reports', 'ai_strategic_insights'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN CONTINUE; END IF;

    FOR v_record IN EXECUTE format('SELECT id, to_jsonb(row_data) AS state FROM public.%I AS row_data ORDER BY created_at, id', v_table)
    LOOP
      BEGIN
        v_occurred_at := COALESCE(
          NULLIF(v_record.state->>'created_at', '')::TIMESTAMPTZ,
          clock_timestamp()
        );
      EXCEPTION WHEN OTHERS THEN
        v_occurred_at := clock_timestamp();
      END;
      PERFORM public.append_farm_event(
        v_table, v_record.id, 'BACKFILL', NULL, v_record.state,
        v_occurred_at, NULL, jsonb_build_object('capture', 'migration_backfill')
      );
    END LOOP;

    EXECUTE format('DROP TRIGGER IF EXISTS capture_farm_twin_event ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER capture_farm_twin_event AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_farm_domain_event()',
      v_table
    );
  END LOOP;
END;
$$;

COMMENT ON TABLE public.farm_events IS
  'Livro temporal imutável e encadeado por hash de todas as mudanças operacionais da fazenda.';
COMMENT ON TABLE public.farm_entities IS
  'Índice atual derivado das entidades acompanhadas pelo Garça Twin; a origem transacional continua nos módulos de domínio.';
COMMENT ON TABLE public.farm_entity_relations IS
  'Relações temporais derivadas entre entidades da fazenda, com validade histórica.';
COMMENT ON FUNCTION public.verify_farm_event_chain(UUID) IS
  'Recalcula a cadeia de hash visível ao usuário e informa qualquer violação de integridade.';

COMMIT;

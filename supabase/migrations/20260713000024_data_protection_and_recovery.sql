-- Data protection control plane: immutable backup evidence and repeatable
-- integrity checks. Backups themselves live outside this database so a lost
-- project never destroys its only recovery copy.

BEGIN;

CREATE TABLE public.data_protection_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_id TEXT NOT NULL UNIQUE,
  backup_type TEXT NOT NULL DEFAULT 'full_logical',
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  retained_until TIMESTAMPTZ,
  encrypted BOOLEAN NOT NULL DEFAULT true,
  database_bytes BIGINT,
  storage_bytes BIGINT,
  encrypted_sha256 TEXT,
  manifest JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT data_protection_runs_type_valid CHECK (backup_type IN ('full_logical', 'data_only', 'platform_daily', 'pitr')),
  CONSTRAINT data_protection_runs_status_valid CHECK (status IN ('started', 'completed', 'verified', 'failed')),
  CONSTRAINT data_protection_runs_target_length CHECK (char_length(btrim(target)) BETWEEN 2 AND 100),
  CONSTRAINT data_protection_runs_hash_format CHECK (
    encrypted_sha256 IS NULL OR encrypted_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT data_protection_runs_sizes_valid CHECK (
    COALESCE(database_bytes, 0) >= 0 AND COALESCE(storage_bytes, 0) >= 0
  ),
  CONSTRAINT data_protection_runs_times_valid CHECK (
    (completed_at IS NULL OR completed_at >= started_at)
    AND (verified_at IS NULL OR completed_at IS NOT NULL)
  )
);

CREATE TABLE public.data_integrity_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  is_valid BOOLEAN NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  checked_events BIGINT NOT NULL DEFAULT 0,
  invalid_events BIGINT NOT NULL DEFAULT 0,
  negative_cattle_lots BIGINT NOT NULL DEFAULT 0,
  negative_inventory_items BIGINT NOT NULL DEFAULT 0,
  stale_pending_actions BIGINT NOT NULL DEFAULT 0,
  issues JSONB NOT NULL DEFAULT '[]'::JSONB,
  metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT data_integrity_checks_source_length CHECK (char_length(btrim(source)) BETWEEN 2 AND 80),
  CONSTRAINT data_integrity_checks_counts_valid CHECK (
    checked_events >= 0 AND invalid_events >= 0
    AND negative_cattle_lots >= 0 AND negative_inventory_items >= 0
    AND stale_pending_actions >= 0
  ),
  CONSTRAINT data_integrity_checks_issues_array CHECK (jsonb_typeof(issues) = 'array'),
  CONSTRAINT data_integrity_checks_metrics_object CHECK (jsonb_typeof(metrics) = 'object')
);

CREATE INDEX idx_data_protection_runs_recent
  ON public.data_protection_runs (started_at DESC);
CREATE INDEX idx_data_protection_runs_verified
  ON public.data_protection_runs (verified_at DESC)
  WHERE status = 'verified';
CREATE INDEX idx_data_integrity_checks_recent
  ON public.data_integrity_checks (checked_at DESC);
CREATE INDEX idx_data_integrity_checks_invalid
  ON public.data_integrity_checks (checked_at DESC)
  WHERE is_valid = false;

CREATE OR REPLACE FUNCTION public.prevent_data_protection_evidence_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Evidências de proteção de dados são imutáveis.' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER prevent_data_protection_runs_mutation
  BEFORE UPDATE OR DELETE ON public.data_protection_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_data_protection_evidence_mutation();
CREATE TRIGGER prevent_data_integrity_checks_mutation
  BEFORE UPDATE OR DELETE ON public.data_integrity_checks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_data_protection_evidence_mutation();

CREATE OR REPLACE FUNCTION public.record_data_protection_run(
  p_backup_id TEXT,
  p_target TEXT,
  p_status TEXT,
  p_started_at TIMESTAMPTZ,
  p_completed_at TIMESTAMPTZ DEFAULT NULL,
  p_verified_at TIMESTAMPTZ DEFAULT NULL,
  p_retained_until TIMESTAMPTZ DEFAULT NULL,
  p_database_bytes BIGINT DEFAULT NULL,
  p_storage_bytes BIGINT DEFAULT NULL,
  p_encrypted_sha256 TEXT DEFAULT NULL,
  p_manifest JSONB DEFAULT '{}'::JSONB,
  p_error_summary TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.data_protection_runs (
    backup_id, target, status, started_at, completed_at, verified_at,
    retained_until, database_bytes, storage_bytes, encrypted_sha256,
    manifest, error_summary
  ) VALUES (
    btrim(p_backup_id), btrim(p_target), p_status, p_started_at, p_completed_at,
    p_verified_at, p_retained_until, p_database_bytes, p_storage_bytes,
    lower(p_encrypted_sha256), COALESCE(p_manifest, '{}'::JSONB),
    NULLIF(left(btrim(p_error_summary), 1000), '')
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_data_integrity_check(
  p_source TEXT DEFAULT 'manual',
  p_record BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_checked_events BIGINT := 0;
  v_invalid_events BIGINT := 0;
  v_negative_cattle BIGINT := 0;
  v_negative_inventory BIGINT := 0;
  v_stale_actions BIGINT := 0;
  v_is_valid BOOLEAN;
  v_issues JSONB := '[]'::JSONB;
  v_metrics JSONB;
  v_checked_at TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT chain.checked_events, chain.invalid_events
  INTO v_checked_events, v_invalid_events
  FROM public.verify_farm_event_chain(NULL) AS chain;

  SELECT count(*) INTO v_negative_cattle
  FROM public.cattle_lots
  WHERE COALESCE(status, 'active') <> 'deleted' AND current_quantity < 0;

  SELECT count(*) INTO v_negative_inventory
  FROM public.inventory_items
  WHERE COALESCE(status, 'active') <> 'deleted' AND current_quantity < 0;

  SELECT count(*) INTO v_stale_actions
  FROM public.pending_actions
  WHERE confirmation_status = 'processing'
    AND updated_at < v_checked_at - INTERVAL '20 minutes';

  IF v_invalid_events > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'farm_event_chain_invalid', 'count', v_invalid_events,
      'message', 'A cadeia histórica do Garça Twin não confere.'
    ));
  END IF;
  IF v_negative_cattle > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'negative_cattle_quantity', 'count', v_negative_cattle,
      'message', 'Existem lotes com quantidade negativa.'
    ));
  END IF;
  IF v_negative_inventory > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'negative_inventory_quantity', 'count', v_negative_inventory,
      'message', 'Existem itens de estoque com quantidade negativa.'
    ));
  END IF;
  IF v_stale_actions > 0 THEN
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'code', 'stale_pending_actions', 'count', v_stale_actions,
      'message', 'Existem ações travadas em processamento.'
    ));
  END IF;

  v_is_valid := v_invalid_events = 0
    AND v_negative_cattle = 0
    AND v_negative_inventory = 0
    AND v_stale_actions = 0;
  v_metrics := jsonb_build_object(
    'checked_events', v_checked_events,
    'invalid_events', v_invalid_events,
    'negative_cattle_lots', v_negative_cattle,
    'negative_inventory_items', v_negative_inventory,
    'stale_pending_actions', v_stale_actions
  );

  IF p_record THEN
    INSERT INTO public.data_integrity_checks (
      source, is_valid, checked_at, checked_events, invalid_events,
      negative_cattle_lots, negative_inventory_items, stale_pending_actions,
      issues, metrics
    ) VALUES (
      left(COALESCE(NULLIF(btrim(p_source), ''), 'manual'), 80),
      v_is_valid, v_checked_at, v_checked_events, v_invalid_events,
      v_negative_cattle, v_negative_inventory, v_stale_actions,
      v_issues, v_metrics
    );
  END IF;

  RETURN jsonb_build_object(
    'is_valid', v_is_valid,
    'checked_at', v_checked_at,
    'issues', v_issues,
    'metrics', v_metrics
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_data_protection_status()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH latest_backup AS (
    SELECT backup_id, target, status, started_at, completed_at, verified_at,
      retained_until, encrypted, database_bytes, storage_bytes, encrypted_sha256
    FROM public.data_protection_runs
    WHERE status IN ('completed', 'verified')
    ORDER BY COALESCE(verified_at, completed_at) DESC NULLS LAST
    LIMIT 1
  ), latest_check AS (
    SELECT is_valid, checked_at, issues, metrics
    FROM public.data_integrity_checks
    ORDER BY checked_at DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'backup', COALESCE((SELECT to_jsonb(latest_backup) FROM latest_backup), 'null'::JSONB),
    'integrity', COALESCE((SELECT to_jsonb(latest_check) FROM latest_check), 'null'::JSONB),
    'backup_fresh', COALESCE((
      SELECT COALESCE(verified_at, completed_at) >= clock_timestamp() - INTERVAL '36 hours'
      FROM latest_backup
    ), false),
    'checked_at', clock_timestamp()
  );
$$;

ALTER TABLE public.data_protection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_integrity_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can read data protection runs"
  ON public.data_protection_runs FOR SELECT TO authenticated
  USING (public.can_read_restricted_farm_data());
CREATE POLICY "Managers can read data integrity checks"
  ON public.data_integrity_checks FOR SELECT TO authenticated
  USING (public.can_read_restricted_farm_data());

REVOKE ALL ON public.data_protection_runs, public.data_integrity_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.data_protection_runs, public.data_integrity_checks TO authenticated;
GRANT ALL ON public.data_protection_runs, public.data_integrity_checks TO service_role;

REVOKE ALL ON FUNCTION public.prevent_data_protection_evidence_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_data_protection_run(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, BIGINT, BIGINT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_data_integrity_check(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_data_protection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_data_protection_run(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, BIGINT, BIGINT, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_data_integrity_check(TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_data_protection_status() TO authenticated, service_role;

COMMENT ON TABLE public.data_protection_runs IS
  'Evidências imutáveis de cópias externas; nunca armazena o conteúdo ou a chave do backup.';
COMMENT ON TABLE public.data_integrity_checks IS
  'Resultados imutáveis das verificações de integridade operacional e histórica.';
COMMENT ON FUNCTION public.run_data_integrity_check(TEXT, BOOLEAN) IS
  'Revalida a cadeia histórica, quantidades e ações em processamento e opcionalmente registra a evidência.';

COMMIT;

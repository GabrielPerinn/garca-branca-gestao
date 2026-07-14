-- Supervised operational autopilot: deterministic rules, idempotent findings and run history.

BEGIN;

CREATE TABLE public.autopilot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL UNIQUE REFERENCES public.farms(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  execution_mode TEXT NOT NULL DEFAULT 'supervised',
  notification_threshold TEXT NOT NULL DEFAULT 'high',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  created_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.autopilot_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  default_severity TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (farm_id, rule_key)
);

CREATE TABLE public.autopilot_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  trigger_source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  evaluated_rules INTEGER NOT NULL DEFAULT 0,
  findings_detected INTEGER NOT NULL DEFAULT 0,
  findings_created INTEGER NOT NULL DEFAULT 0,
  findings_resolved INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  stats_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT,
  initiated_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.autopilot_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.autopilot_rules(id) ON DELETE RESTRICT,
  rule_key TEXT NOT NULL,
  latest_run_id UUID REFERENCES public.autopilot_runs(id) ON DELETE SET NULL,
  fingerprint TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  evidence_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  related_table TEXT,
  related_id UUID,
  status TEXT NOT NULL DEFAULT 'open',
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  resolved_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  pending_action_id UUID REFERENCES public.pending_actions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (farm_id, rule_key, fingerprint)
);

CREATE TABLE public.autopilot_run_findings (
  run_id UUID NOT NULL REFERENCES public.autopilot_runs(id) ON DELETE CASCADE,
  finding_id UUID NOT NULL REFERENCES public.autopilot_findings(id) ON DELETE CASCADE,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, finding_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autopilot_settings_mode_valid') THEN
    ALTER TABLE public.autopilot_settings ADD CONSTRAINT autopilot_settings_mode_valid
      CHECK (execution_mode = 'supervised') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autopilot_settings_threshold_valid') THEN
    ALTER TABLE public.autopilot_settings ADD CONSTRAINT autopilot_settings_threshold_valid
      CHECK (notification_threshold IN ('critical', 'high', 'medium')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autopilot_rule_key_valid') THEN
    ALTER TABLE public.autopilot_rules ADD CONSTRAINT autopilot_rule_key_valid
      CHECK (rule_key ~ '^[a-z][a-z0-9_]{2,62}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autopilot_rule_category_valid') THEN
    ALTER TABLE public.autopilot_rules ADD CONSTRAINT autopilot_rule_category_valid
      CHECK (category IN ('tasks', 'inventory', 'livestock', 'compliance', 'finance', 'operations')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autopilot_rule_severity_valid') THEN
    ALTER TABLE public.autopilot_rules ADD CONSTRAINT autopilot_rule_severity_valid
      CHECK (default_severity IN ('critical', 'high', 'medium', 'low')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autopilot_run_source_valid') THEN
    ALTER TABLE public.autopilot_runs ADD CONSTRAINT autopilot_run_source_valid
      CHECK (trigger_source IN ('manual', 'scheduled', 'event')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autopilot_run_status_valid') THEN
    ALTER TABLE public.autopilot_runs ADD CONSTRAINT autopilot_run_status_valid
      CHECK (status IN ('running', 'completed', 'failed', 'skipped')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autopilot_finding_status_valid') THEN
    ALTER TABLE public.autopilot_findings ADD CONSTRAINT autopilot_finding_status_valid
      CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autopilot_finding_severity_valid') THEN
    ALTER TABLE public.autopilot_findings ADD CONSTRAINT autopilot_finding_severity_valid
      CHECK (severity IN ('critical', 'high', 'medium', 'low')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autopilot_positive_counters') THEN
    ALTER TABLE public.autopilot_findings ADD CONSTRAINT autopilot_positive_counters
      CHECK (occurrence_count > 0) NOT VALID;
  END IF;
END;
$$;

CREATE UNIQUE INDEX uq_autopilot_running_per_farm
  ON public.autopilot_runs (farm_id) WHERE status = 'running';
CREATE INDEX idx_autopilot_runs_farm_started
  ON public.autopilot_runs (farm_id, started_at DESC);
CREATE INDEX idx_autopilot_findings_open
  ON public.autopilot_findings (farm_id, severity, last_detected_at DESC)
  WHERE status IN ('open', 'acknowledged');
CREATE INDEX idx_autopilot_findings_related
  ON public.autopilot_findings (related_table, related_id)
  WHERE related_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_autopilot_finding(
  p_run_id UUID,
  p_rule_id UUID,
  p_fingerprint TEXT,
  p_category TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_summary TEXT,
  p_recommended_action TEXT,
  p_evidence_json JSONB DEFAULT '{}'::JSONB,
  p_related_table TEXT DEFAULT NULL,
  p_related_id UUID DEFAULT NULL
)
RETURNS TABLE(finding_id UUID, was_created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_farm_id UUID;
  v_rule_key TEXT;
  v_id UUID;
  v_created BOOLEAN := false;
BEGIN
  SELECT run.farm_id INTO v_farm_id
  FROM public.autopilot_runs AS run
  WHERE run.id = p_run_id AND run.status = 'running'
  FOR UPDATE;
  IF v_farm_id IS NULL THEN RAISE EXCEPTION 'Execução do Autopiloto não está ativa.' USING ERRCODE = '55000'; END IF;

  SELECT rule.rule_key INTO v_rule_key
  FROM public.autopilot_rules AS rule
  WHERE rule.id = p_rule_id AND rule.farm_id = v_farm_id AND rule.enabled = true;
  IF v_rule_key IS NULL THEN RAISE EXCEPTION 'Regra inválida ou desativada.' USING ERRCODE = '22023'; END IF;

  SELECT finding.id INTO v_id
  FROM public.autopilot_findings AS finding
  WHERE finding.farm_id = v_farm_id AND finding.rule_key = v_rule_key AND finding.fingerprint = p_fingerprint
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.autopilot_findings (
      farm_id, rule_id, rule_key, latest_run_id, fingerprint, category, severity,
      title, summary, recommended_action, evidence_json, related_table, related_id
    ) VALUES (
      v_farm_id, p_rule_id, v_rule_key, p_run_id, p_fingerprint, p_category, p_severity,
      left(p_title, 240), left(p_summary, 2000), left(p_recommended_action, 2000),
      COALESCE(p_evidence_json, '{}'::JSONB), p_related_table, p_related_id
    ) RETURNING id INTO v_id;
    v_created := true;
  ELSE
    UPDATE public.autopilot_findings
    SET rule_id = p_rule_id,
        latest_run_id = p_run_id,
        category = p_category,
        severity = p_severity,
        title = left(p_title, 240),
        summary = left(p_summary, 2000),
        recommended_action = left(p_recommended_action, 2000),
        evidence_json = COALESCE(p_evidence_json, '{}'::JSONB),
        related_table = p_related_table,
        related_id = p_related_id,
        status = CASE WHEN status = 'dismissed' THEN status ELSE 'open' END,
        occurrence_count = occurrence_count + 1,
        last_detected_at = clock_timestamp(),
        resolved_at = NULL,
        updated_at = clock_timestamp()
    WHERE id = v_id;
  END IF;

  INSERT INTO public.autopilot_run_findings (run_id, finding_id)
  VALUES (p_run_id, v_id) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT v_id, v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_missing_autopilot_findings(
  p_run_id UUID,
  p_evaluated_rule_keys TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_farm_id UUID;
  v_count INTEGER;
BEGIN
  SELECT farm_id INTO v_farm_id FROM public.autopilot_runs WHERE id = p_run_id AND status = 'running';
  IF v_farm_id IS NULL THEN RAISE EXCEPTION 'Execução do Autopiloto não está ativa.' USING ERRCODE = '55000'; END IF;

  UPDATE public.autopilot_findings AS finding
  SET status = 'resolved', resolved_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE finding.farm_id = v_farm_id
    AND finding.rule_key = ANY(COALESCE(p_evaluated_rule_keys, ARRAY[]::TEXT[]))
    AND finding.status IN ('open', 'acknowledged')
    AND NOT EXISTS (
      SELECT 1 FROM public.autopilot_run_findings AS detected
      WHERE detected.run_id = p_run_id AND detected.finding_id = finding.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_autopilot_run(
  p_run_id UUID,
  p_status TEXT,
  p_evaluated_rules INTEGER,
  p_findings_detected INTEGER,
  p_findings_created INTEGER,
  p_findings_resolved INTEGER,
  p_duration_ms INTEGER,
  p_stats_json JSONB DEFAULT '{}'::JSONB,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_farm_id UUID;
BEGIN
  IF p_status NOT IN ('completed', 'failed', 'skipped') THEN RAISE EXCEPTION 'Status final inválido.' USING ERRCODE = '22023'; END IF;
  UPDATE public.autopilot_runs
  SET status = p_status, completed_at = clock_timestamp(),
      evaluated_rules = GREATEST(COALESCE(p_evaluated_rules, 0), 0),
      findings_detected = GREATEST(COALESCE(p_findings_detected, 0), 0),
      findings_created = GREATEST(COALESCE(p_findings_created, 0), 0),
      findings_resolved = GREATEST(COALESCE(p_findings_resolved, 0), 0),
      duration_ms = GREATEST(COALESCE(p_duration_ms, 0), 0),
      stats_json = COALESCE(p_stats_json, '{}'::JSONB),
      error_message = CASE WHEN p_error_message IS NULL THEN NULL ELSE left(p_error_message, 1000) END
  WHERE id = p_run_id AND status = 'running'
  RETURNING farm_id INTO v_farm_id;
  IF v_farm_id IS NULL THEN RAISE EXCEPTION 'Execução já finalizada ou inexistente.' USING ERRCODE = '55000'; END IF;
  UPDATE public.autopilot_settings
  SET last_run_at = clock_timestamp(), last_run_status = p_status, updated_at = clock_timestamp()
  WHERE farm_id = v_farm_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_autopilot_task_action(
  p_finding_id UUID,
  p_profile_id UUID,
  p_interpreted_data JSONB,
  p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_finding public.autopilot_findings%ROWTYPE;
  v_pending_id UUID;
BEGIN
  SELECT * INTO v_finding FROM public.autopilot_findings WHERE id = p_finding_id FOR UPDATE;
  IF v_finding.id IS NULL THEN RAISE EXCEPTION 'Achado não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF v_finding.pending_action_id IS NOT NULL THEN RETURN v_finding.pending_action_id; END IF;
  IF v_finding.status NOT IN ('open', 'acknowledged') THEN
    RAISE EXCEPTION 'Somente achados ativos podem ser transformados em tarefa.' USING ERRCODE = '55000';
  END IF;
  IF p_interpreted_data IS NULL OR jsonb_typeof(p_interpreted_data) <> 'object' THEN
    RAISE EXCEPTION 'Plano de tarefa inválido.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pending_actions (
    source_message_id, action_type, interpreted_data_json, confidence_score,
    missing_fields_json, requires_confirmation, confirmation_status,
    requested_by_user_id, input_modality, plan_version, expires_at
  ) VALUES (
    NULL, 'create_task', p_interpreted_data, 1, '[]'::JSONB, true, 'pending',
    p_profile_id, 'text', 2, p_expires_at
  ) RETURNING id INTO v_pending_id;

  UPDATE public.autopilot_findings
  SET status = 'acknowledged', pending_action_id = v_pending_id,
      reviewed_by = p_profile_id, reviewed_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE id = p_finding_id;
  RETURN v_pending_id;
END;
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
      'ai_strategic_reports', 'ai_strategic_insights', 'autopilot_findings'
    ]) THEN 'restricted'
    ELSE 'standard'
  END;
$$;

INSERT INTO public.autopilot_settings (farm_id)
SELECT farm.id FROM public.farms AS farm
WHERE COALESCE(farm.status, 'active') <> 'deleted'
ON CONFLICT (farm_id) DO NOTHING;

INSERT INTO public.autopilot_rules (farm_id, rule_key, name, description, category, default_severity, config_json)
SELECT farm.id, preset.rule_key, preset.name, preset.description, preset.category, preset.severity, preset.config
FROM public.farms AS farm
CROSS JOIN (VALUES
  ('overdue_tasks', 'Tarefas vencidas', 'Detecta tarefas pendentes cujo prazo já terminou.', 'tasks', 'high', '{"critical_days":7}'::JSONB),
  ('low_inventory', 'Estoque abaixo do mínimo', 'Compara o saldo atual de cada item com seu estoque mínimo.', 'inventory', 'high', '{}'::JSONB),
  ('pasture_overcapacity', 'Capacidade dos pastos', 'Compara a quantidade nos lotes com a capacidade informada do pasto.', 'livestock', 'high', '{"critical_ratio":1.2}'::JSONB),
  ('unreviewed_occurrences', 'Ocorrências críticas sem revisão', 'Sinaliza ocorrências prioritárias que ainda aguardam revisão.', 'operations', 'high', '{"critical_hours":48}'::JSONB),
  ('expiring_documents', 'Documentos próximos do vencimento', 'Monitora documentos vencidos ou que vencem nos próximos 30 dias.', 'compliance', 'high', '{"warning_days":30}'::JSONB),
  ('stale_weighings', 'Lotes sem pesagem recente', 'Identifica lotes ativos sem pesagem dentro da janela definida.', 'livestock', 'medium', '{"stale_days":90}'::JSONB),
  ('expense_acceleration', 'Aceleração das despesas', 'Compara as despesas dos últimos 30 dias com os 30 dias anteriores.', 'finance', 'high', '{"ratio":1.5,"minimum_delta":10000}'::JSONB)
) AS preset(rule_key, name, description, category, severity, config)
WHERE COALESCE(farm.status, 'active') <> 'deleted'
ON CONFLICT (farm_id, rule_key) DO NOTHING;

ALTER TABLE public.autopilot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autopilot_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autopilot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autopilot_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autopilot_run_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can read autopilot settings" ON public.autopilot_settings FOR SELECT TO authenticated USING (public.can_read_restricted_farm_data());
CREATE POLICY "Managers can read autopilot rules" ON public.autopilot_rules FOR SELECT TO authenticated USING (public.can_read_restricted_farm_data());
CREATE POLICY "Managers can read autopilot runs" ON public.autopilot_runs FOR SELECT TO authenticated USING (public.can_read_restricted_farm_data());
CREATE POLICY "Managers can read autopilot findings" ON public.autopilot_findings FOR SELECT TO authenticated USING (public.can_read_restricted_farm_data());
CREATE POLICY "Managers can read autopilot detections" ON public.autopilot_run_findings FOR SELECT TO authenticated USING (public.can_read_restricted_farm_data());

REVOKE ALL ON public.autopilot_settings, public.autopilot_rules, public.autopilot_runs, public.autopilot_findings, public.autopilot_run_findings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.autopilot_settings, public.autopilot_rules, public.autopilot_runs, public.autopilot_findings, public.autopilot_run_findings TO authenticated;
GRANT ALL ON public.autopilot_settings, public.autopilot_rules, public.autopilot_runs, public.autopilot_findings, public.autopilot_run_findings TO service_role;
REVOKE ALL ON FUNCTION public.record_autopilot_finding(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_missing_autopilot_findings(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_autopilot_run(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_autopilot_task_action(UUID, UUID, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_autopilot_finding(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_missing_autopilot_findings(UUID, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_autopilot_run(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_autopilot_task_action(UUID, UUID, JSONB, TIMESTAMPTZ) TO service_role;

CREATE TRIGGER set_updated_at_autopilot_settings BEFORE UPDATE ON public.autopilot_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_autopilot_rules BEFORE UPDATE ON public.autopilot_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_autopilot_findings BEFORE UPDATE ON public.autopilot_findings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_autopilot_rules AFTER INSERT OR UPDATE ON public.autopilot_rules FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_autopilot_findings AFTER INSERT OR UPDATE ON public.autopilot_findings FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER capture_farm_twin_event AFTER INSERT OR UPDATE ON public.autopilot_findings FOR EACH ROW EXECUTE FUNCTION public.capture_farm_domain_event();

COMMIT;

-- Decision planning: versioned simulations and measurable farm goals.
-- Results are deterministic projections built from an immutable baseline snapshot
-- and explicit assumptions; they are not treated as observed operational facts.

BEGIN;

CREATE TABLE public.farm_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  metric TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  target_date DATE NOT NULL,
  baseline_value NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT farm_goals_title_length CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  CONSTRAINT farm_goals_metric_valid CHECK (metric IN (
    'monthly_result', 'herd_size', 'monthly_revenue', 'monthly_expenses', 'stocking_rate'
  )),
  CONSTRAINT farm_goals_status_valid CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  CONSTRAINT farm_goals_target_date_valid CHECK (target_date >= created_at::DATE),
  CONSTRAINT farm_goals_farm_id_id_unique UNIQUE (farm_id, id)
);

CREATE TABLE public.planning_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'custom',
  horizon_months INTEGER NOT NULL,
  assumptions_json JSONB NOT NULL,
  baseline_json JSONB NOT NULL,
  result_json JSONB NOT NULL,
  confidence_score INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  linked_goal_id UUID REFERENCES public.farm_goals(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT planning_scenarios_name_length CHECK (char_length(btrim(name)) BETWEEN 3 AND 160),
  CONSTRAINT planning_scenarios_template_valid CHECK (template_type IN (
    'custom', 'herd_growth', 'cost_reduction', 'market_stress', 'capacity_investment'
  )),
  CONSTRAINT planning_scenarios_horizon_valid CHECK (horizon_months BETWEEN 1 AND 60),
  CONSTRAINT planning_scenarios_confidence_valid CHECK (confidence_score BETWEEN 0 AND 100),
  CONSTRAINT planning_scenarios_status_valid CHECK (status IN ('draft', 'approved', 'archived')),
  CONSTRAINT planning_scenarios_assumptions_object CHECK (jsonb_typeof(assumptions_json) = 'object'),
  CONSTRAINT planning_scenarios_baseline_object CHECK (jsonb_typeof(baseline_json) = 'object'),
  CONSTRAINT planning_scenarios_result_object CHECK (jsonb_typeof(result_json) = 'object'),
  CONSTRAINT planning_scenarios_goal_same_farm FOREIGN KEY (farm_id, linked_goal_id)
    REFERENCES public.farm_goals(farm_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_farm_goals_active
  ON public.farm_goals (farm_id, target_date, created_at DESC)
  WHERE status IN ('active', 'paused');
CREATE INDEX idx_planning_scenarios_farm_created
  ON public.planning_scenarios (farm_id, created_at DESC);
CREATE INDEX idx_planning_scenarios_status
  ON public.planning_scenarios (farm_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.farm_event_visibility(p_table_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_table_name = ANY (ARRAY[
      'expenses', 'revenues', 'employee_payments', 'cattle_sales', 'sales',
      'ai_strategic_reports', 'ai_strategic_insights', 'autopilot_findings',
      'farm_goals', 'planning_scenarios'
    ]) THEN 'restricted'
    ELSE 'standard'
  END;
$$;

ALTER TABLE public.farm_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can read farm goals"
  ON public.farm_goals FOR SELECT TO authenticated
  USING (public.can_read_restricted_farm_data());
CREATE POLICY "Managers can read planning scenarios"
  ON public.planning_scenarios FOR SELECT TO authenticated
  USING (public.can_read_restricted_farm_data());

REVOKE ALL ON public.farm_goals, public.planning_scenarios FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.farm_goals, public.planning_scenarios TO authenticated;
GRANT ALL ON public.farm_goals, public.planning_scenarios TO service_role;

CREATE TRIGGER set_updated_at_farm_goals
  BEFORE UPDATE ON public.farm_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_planning_scenarios
  BEFORE UPDATE ON public.planning_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER prevent_delete_farm_goals
  BEFORE DELETE ON public.farm_goals
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();
CREATE TRIGGER prevent_delete_planning_scenarios
  BEFORE DELETE ON public.planning_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_delete();
CREATE TRIGGER audit_farm_goals
  AFTER INSERT OR UPDATE ON public.farm_goals
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER audit_planning_scenarios
  AFTER INSERT OR UPDATE ON public.planning_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER capture_farm_twin_event
  AFTER INSERT OR UPDATE ON public.farm_goals
  FOR EACH ROW EXECUTE FUNCTION public.capture_farm_domain_event();
CREATE TRIGGER capture_farm_twin_event
  AFTER INSERT OR UPDATE ON public.planning_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.capture_farm_domain_event();

COMMENT ON TABLE public.farm_goals IS
  'Metas mensuráveis comparadas com a linha de base real da fazenda no momento da criação.';
COMMENT ON TABLE public.planning_scenarios IS
  'Simulações de decisão reproduzíveis com linha de base, premissas e resultado persistidos separadamente.';
COMMENT ON COLUMN public.planning_scenarios.confidence_score IS
  'Qualidade de cobertura dos dados e completude das premissas; não representa probabilidade de sucesso.';

COMMIT;

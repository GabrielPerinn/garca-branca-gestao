BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(27);

SELECT has_table('public', 'farm_goals', 'metas da fazenda existem');
SELECT has_table('public', 'planning_scenarios', 'cenários de decisão existem');
SELECT has_column('public', 'planning_scenarios', 'assumptions_json', 'premissas são persistidas');
SELECT has_column('public', 'planning_scenarios', 'baseline_json', 'linha de base é preservada');
SELECT has_column('public', 'planning_scenarios', 'result_json', 'resultado calculado é preservado');
SELECT has_index('public', 'farm_goals', 'idx_farm_goals_active', 'metas ativas possuem índice');
SELECT has_index('public', 'planning_scenarios', 'idx_planning_scenarios_farm_created', 'histórico de cenários possui índice');
SELECT has_index('public', 'planning_scenarios', 'idx_planning_scenarios_status', 'governança dos cenários possui índice');
SELECT has_trigger('public', 'farm_goals', 'set_updated_at_farm_goals', 'metas mantêm data de atualização');
SELECT has_trigger('public', 'farm_goals', 'audit_farm_goals', 'metas possuem auditoria');
SELECT has_trigger('public', 'farm_goals', 'capture_farm_twin_event', 'metas alimentam o Garça Twin');
SELECT has_trigger('public', 'farm_goals', 'prevent_delete_farm_goals', 'metas não permitem exclusão física');
SELECT has_trigger('public', 'planning_scenarios', 'set_updated_at_planning_scenarios', 'cenários mantêm data de atualização');
SELECT has_trigger('public', 'planning_scenarios', 'audit_planning_scenarios', 'cenários possuem auditoria');
SELECT has_trigger('public', 'planning_scenarios', 'capture_farm_twin_event', 'cenários alimentam o Garça Twin');
SELECT has_trigger('public', 'planning_scenarios', 'prevent_delete_planning_scenarios', 'cenários não permitem exclusão física');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.farm_goals'::regclass), 'RLS está ativa nas metas');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.planning_scenarios'::regclass), 'RLS está ativa nos cenários');
SELECT is(public.farm_event_visibility('farm_goals'), 'restricted', 'metas têm visibilidade restrita');
SELECT is(public.farm_event_visibility('planning_scenarios'), 'restricted', 'cenários têm visibilidade restrita');

CREATE TEMP TABLE planning_test_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);
WITH existing AS (
  SELECT id FROM public.farms WHERE COALESCE(status, 'active') <> 'deleted' ORDER BY created_at, id LIMIT 1
), inserted AS (
  INSERT INTO public.farms (name) SELECT 'Fazenda Teste Planejamento' WHERE NOT EXISTS (SELECT 1 FROM existing) RETURNING id
), selected AS (
  SELECT id FROM existing UNION ALL SELECT id FROM inserted
)
INSERT INTO planning_test_ids SELECT 'farm', id FROM selected LIMIT 1;

WITH inserted AS (
  INSERT INTO public.farm_goals (
    farm_id, title, metric, target_value, unit, target_date, baseline_value
  ) SELECT id, 'Elevar resultado mensal', 'monthly_result', 150000, 'BRL/mês', current_date + 365, 100000
    FROM planning_test_ids WHERE kind = 'farm'
  RETURNING id
)
INSERT INTO planning_test_ids SELECT 'goal', id FROM inserted;

WITH inserted AS (
  INSERT INTO public.planning_scenarios (
    farm_id, name, template_type, horizon_months, assumptions_json,
    baseline_json, result_json, confidence_score, linked_goal_id
  ) SELECT
    (SELECT id FROM planning_test_ids WHERE kind = 'farm'),
    'Redução estruturada de custos', 'cost_reduction', 12,
    '{"horizonMonths":12,"monthlyExpenseChangePercent":-10}',
    '{"monthlyRevenue":200000,"monthlyExpenses":100000,"monthlyResult":100000}',
    '{"netCashImpact":120000,"classification":"viable"}', 85,
    (SELECT id FROM planning_test_ids WHERE kind = 'goal')
  RETURNING id
)
INSERT INTO planning_test_ids SELECT 'scenario', id FROM inserted;

SELECT is((SELECT count(*)::INTEGER FROM public.farm_goals WHERE id = (SELECT id FROM planning_test_ids WHERE kind = 'goal')), 1, 'meta é persistida uma única vez');
SELECT is((SELECT count(*)::INTEGER FROM public.planning_scenarios WHERE id = (SELECT id FROM planning_test_ids WHERE kind = 'scenario')), 1, 'cenário é persistido com sua fotografia');
SELECT ok(EXISTS (SELECT 1 FROM public.farm_events WHERE entity_type = 'farm_goals' AND entity_id = (SELECT id FROM planning_test_ids WHERE kind = 'goal')), 'meta possui histórico temporal');
SELECT ok(EXISTS (SELECT 1 FROM public.farm_events WHERE entity_type = 'planning_scenarios' AND entity_id = (SELECT id FROM planning_test_ids WHERE kind = 'scenario')), 'cenário possui histórico temporal');
SELECT ok((SELECT is_valid FROM public.verify_farm_event_chain(NULL)), 'cadeia de eventos permanece íntegra');

SELECT throws_ok(
  $$DELETE FROM public.farm_goals WHERE id = (SELECT id FROM planning_test_ids WHERE kind = 'goal')$$,
  'P0001',
  'Exclusão física proibida nesta tabela. Use UPDATE status = ''deleted''.',
  'meta não pode ser removida fisicamente'
);
SELECT throws_ok(
  $$DELETE FROM public.planning_scenarios WHERE id = (SELECT id FROM planning_test_ids WHERE kind = 'scenario')$$,
  'P0001',
  'Exclusão física proibida nesta tabela. Use UPDATE status = ''deleted''.',
  'cenário não pode ser removido fisicamente'
);

SELECT * FROM finish();
ROLLBACK;

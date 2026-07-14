BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(21);

SELECT has_table('public', 'autopilot_settings', 'configurações do Autopiloto existem');
SELECT has_table('public', 'autopilot_rules', 'regras do Autopiloto existem');
SELECT has_table('public', 'autopilot_runs', 'execuções do Autopiloto existem');
SELECT has_table('public', 'autopilot_findings', 'achados do Autopiloto existem');
SELECT has_table('public', 'autopilot_run_findings', 'vínculos de detecção existem');
SELECT has_function('public', 'record_autopilot_finding', ARRAY['uuid','uuid','text','text','text','text','text','text','jsonb','text','uuid'], 'registro idempotente existe');
SELECT has_function('public', 'resolve_missing_autopilot_findings', ARRAY['uuid','text[]'], 'reconciliação automática existe');
SELECT has_function('public', 'finish_autopilot_run', ARRAY['uuid','text','integer','integer','integer','integer','integer','jsonb','text'], 'finalização de execução existe');
SELECT has_function('public', 'prepare_autopilot_task_action', ARRAY['uuid','uuid','jsonb','timestamp with time zone'], 'preparação transacional de tarefa existe');
SELECT has_trigger('public', 'autopilot_findings', 'capture_farm_twin_event', 'achados alimentam o gêmeo digital');
SELECT has_index('public', 'autopilot_runs', 'uq_autopilot_running_per_farm', 'uma fazenda não executa duas análises simultâneas');

CREATE TEMP TABLE autopilot_test_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);
WITH existing AS (
  SELECT id FROM public.farms WHERE COALESCE(status, 'active') <> 'deleted' ORDER BY created_at, id LIMIT 1
), inserted AS (
  INSERT INTO public.farms (name) SELECT 'Fazenda Teste Autopiloto' WHERE NOT EXISTS (SELECT 1 FROM existing) RETURNING id
), selected AS (
  SELECT id FROM existing UNION ALL SELECT id FROM inserted
)
INSERT INTO autopilot_test_ids SELECT 'farm', id FROM selected LIMIT 1;

INSERT INTO public.autopilot_settings (farm_id)
SELECT id FROM autopilot_test_ids WHERE kind = 'farm'
ON CONFLICT (farm_id) DO NOTHING;
INSERT INTO public.autopilot_rules (farm_id, rule_key, name, description, category, default_severity)
SELECT id, 'test_operational_rule', 'Regra de teste', 'Valida a infraestrutura', 'operations', 'high'
FROM autopilot_test_ids WHERE kind = 'farm'
ON CONFLICT (farm_id, rule_key) DO UPDATE SET enabled = true
RETURNING id;

INSERT INTO autopilot_test_ids
SELECT 'rule', id FROM public.autopilot_rules
WHERE farm_id = (SELECT id FROM autopilot_test_ids WHERE kind = 'farm') AND rule_key = 'test_operational_rule';

SELECT is((SELECT count(*)::INTEGER FROM public.autopilot_rules WHERE id = (SELECT id FROM autopilot_test_ids WHERE kind = 'rule')), 1, 'regra fica configurada uma única vez');

WITH inserted AS (
  INSERT INTO public.autopilot_runs (farm_id, trigger_source)
  SELECT id, 'manual' FROM autopilot_test_ids WHERE kind = 'farm' RETURNING id
)
INSERT INTO autopilot_test_ids SELECT 'run1', id FROM inserted;

SELECT * FROM public.record_autopilot_finding(
  (SELECT id FROM autopilot_test_ids WHERE kind = 'run1'),
  (SELECT id FROM autopilot_test_ids WHERE kind = 'rule'),
  'same-risk', 'operations', 'high', 'Risco de teste', 'Resumo verificável', 'Revisar', '{"value":1}', 'tasks', gen_random_uuid()
);
SELECT * FROM public.record_autopilot_finding(
  (SELECT id FROM autopilot_test_ids WHERE kind = 'run1'),
  (SELECT id FROM autopilot_test_ids WHERE kind = 'rule'),
  'same-risk', 'operations', 'critical', 'Risco atualizado', 'Resumo atualizado', 'Agir', '{"value":2}', 'tasks', gen_random_uuid()
);

SELECT is((SELECT count(*)::INTEGER FROM public.autopilot_findings WHERE rule_key = 'test_operational_rule' AND fingerprint = 'same-risk'), 1, 'detecção repetida é idempotente');
SELECT is((SELECT occurrence_count FROM public.autopilot_findings WHERE rule_key = 'test_operational_rule' AND fingerprint = 'same-risk'), 2, 'repetição incrementa a recorrência');
SELECT is((SELECT count(*)::INTEGER FROM public.autopilot_run_findings WHERE run_id = (SELECT id FROM autopilot_test_ids WHERE kind = 'run1')), 1, 'execução mantém um vínculo por achado');

SELECT public.finish_autopilot_run((SELECT id FROM autopilot_test_ids WHERE kind = 'run1'), 'completed', 1, 1, 1, 0, 10, '{}', NULL);
SELECT is((SELECT status FROM public.autopilot_runs WHERE id = (SELECT id FROM autopilot_test_ids WHERE kind = 'run1')), 'completed', 'execução é finalizada de forma consistente');

INSERT INTO autopilot_test_ids (kind, id)
SELECT 'pending', public.prepare_autopilot_task_action(
  (SELECT id FROM public.autopilot_findings WHERE rule_key = 'test_operational_rule' AND fingerprint = 'same-risk'),
  NULL,
  '{"title":"Revisar risco","due_date":"2026-07-20","priority":"high","missing_fields":[]}',
  clock_timestamp() + interval '7 days'
);
SELECT is(
  public.prepare_autopilot_task_action(
    (SELECT id FROM public.autopilot_findings WHERE rule_key = 'test_operational_rule' AND fingerprint = 'same-risk'),
    NULL,
    '{"title":"Revisar risco","due_date":"2026-07-20","priority":"high","missing_fields":[]}',
    clock_timestamp() + interval '7 days'
  ),
  (SELECT id FROM autopilot_test_ids WHERE kind = 'pending'),
  'preparação repetida devolve a mesma ação pendente'
);
SELECT is((SELECT count(*)::INTEGER FROM public.pending_actions WHERE id = (SELECT id FROM autopilot_test_ids WHERE kind = 'pending')), 1, 'apenas uma ação supervisionada é criada');

WITH inserted AS (
  INSERT INTO public.autopilot_runs (farm_id, trigger_source)
  SELECT id, 'scheduled' FROM autopilot_test_ids WHERE kind = 'farm' RETURNING id
)
INSERT INTO autopilot_test_ids SELECT 'run2', id FROM inserted;

SELECT is(public.resolve_missing_autopilot_findings((SELECT id FROM autopilot_test_ids WHERE kind = 'run2'), ARRAY['test_operational_rule']), 1, 'risco ausente na nova execução é reconciliado');
SELECT is((SELECT status FROM public.autopilot_findings WHERE rule_key = 'test_operational_rule' AND fingerprint = 'same-risk'), 'resolved', 'achado deixa de permanecer aberto quando o risco desaparece');
SELECT ok(EXISTS (SELECT 1 FROM public.farm_events WHERE entity_type = 'autopilot_findings' AND entity_id = (SELECT id FROM public.autopilot_findings WHERE rule_key = 'test_operational_rule' AND fingerprint = 'same-risk')), 'achado possui histórico verificável no Garça Twin');

SELECT * FROM finish();
ROLLBACK;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);

SELECT has_table('public', 'livestock_protocols', 'protocolos coletivos existem');
SELECT has_table('public', 'livestock_protocol_executions', 'histórico de manejo existe');
SELECT has_table('public', 'offline_commands', 'fila idempotente offline existe');
SELECT has_function('public', 'complete_livestock_protocol', ARRAY['uuid','date','integer','text','text','date','uuid'], 'confirmação transacional existe');
SELECT has_function('public', 'process_offline_livestock_command', ARRAY['uuid','uuid','jsonb','text','timestamp with time zone'], 'sincronização offline existe');
SELECT has_trigger('public', 'livestock_protocols', 'sync_livestock_protocol_alert', 'protocolo gera alarme');
SELECT has_trigger('public', 'livestock_protocols', 'enforce_livestock_protocol_scope', 'escopo do protocolo é validado');
SELECT has_index('public', 'livestock_protocols', 'idx_livestock_protocols_due', 'agenda possui índice por vencimento');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.livestock_protocols'::regclass), 'RLS protege protocolos');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.offline_commands'::regclass), 'RLS protege comandos offline');

CREATE TEMP TABLE health_test_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);

WITH inserted AS (INSERT INTO public.users_profiles (full_name, role) VALUES ('Gestor Teste Saúde', 'admin') RETURNING id)
INSERT INTO health_test_ids SELECT 'actor', id FROM inserted;
WITH inserted AS (INSERT INTO public.farms (name) VALUES ('Operação Teste Saúde') RETURNING id)
INSERT INTO health_test_ids SELECT 'farm', id FROM inserted;
WITH inserted AS (
  INSERT INTO public.land_parcels (farm_id, name, total_area_ha)
  SELECT id, 'Fazenda Saúde', 600 FROM health_test_ids WHERE kind = 'farm' RETURNING id
)
INSERT INTO health_test_ids SELECT 'property', id FROM inserted;
WITH inserted AS (
  INSERT INTO public.cattle_lots (farm_id, name, category, current_quantity)
  SELECT id, 'Matrizes Teste', 'Matrizes', 180 FROM health_test_ids WHERE kind = 'farm' RETURNING id
)
INSERT INTO health_test_ids SELECT 'lot', id FROM inserted;
WITH inserted AS (
  INSERT INTO public.livestock_protocols (
    farm_id, cattle_lot_id, name, protocol_type, event_type, scope_type,
    product_name, next_due_date, recurrence_days, alert_lead_days
  ) SELECT farm.id, lot.id, 'Vacinação matrizes teste', 'sanitary', 'vaccination', 'lot',
    'Vacina Teste', current_date, 90, 7
  FROM health_test_ids farm CROSS JOIN health_test_ids lot
  WHERE farm.kind = 'farm' AND lot.kind = 'lot' RETURNING id
)
INSERT INTO health_test_ids SELECT 'protocol', id FROM inserted;

SELECT ok(EXISTS (SELECT 1 FROM public.alerts WHERE related_table = 'livestock_protocols' AND related_id = (SELECT id FROM health_test_ids WHERE kind = 'protocol') AND status = 'pending'), 'criação gera alarme ativo');
SELECT is((SELECT due_date FROM public.alerts WHERE related_table = 'livestock_protocols' AND related_id = (SELECT id FROM health_test_ids WHERE kind = 'protocol')), current_date - 7, 'alarme respeita antecedência');
SELECT ok(position('Lote: Matrizes Teste' IN (SELECT message FROM public.alerts WHERE related_table = 'livestock_protocols' AND related_id = (SELECT id FROM health_test_ids WHERE kind = 'protocol'))) > 0, 'alarme informa o escopo coletivo');

SELECT ok(public.complete_livestock_protocol(
  (SELECT id FROM health_test_ids WHERE kind = 'protocol'), current_date, 175,
  'completed', 'Cinco animais separados para avaliação', NULL,
  (SELECT id FROM health_test_ids WHERE kind = 'actor')
) IS NOT NULL, 'execução coletiva é registrada');
SELECT is((SELECT count(*)::INTEGER FROM public.livestock_protocol_executions WHERE protocol_id = (SELECT id FROM health_test_ids WHERE kind = 'protocol')), 1, 'histórico recebe uma execução');
SELECT is((SELECT next_due_date FROM public.livestock_protocols WHERE id = (SELECT id FROM health_test_ids WHERE kind = 'protocol')), current_date + 90, 'recorrência agenda o próximo ciclo');
SELECT is((SELECT due_date FROM public.alerts WHERE related_table = 'livestock_protocols' AND related_id = (SELECT id FROM health_test_ids WHERE kind = 'protocol')), current_date + 83, 'alarme é recalculado para o novo ciclo');
SELECT is((SELECT last_executed_at FROM public.livestock_protocols WHERE id = (SELECT id FROM health_test_ids WHERE kind = 'protocol')), current_date, 'protocolo guarda a última realização');

CREATE TEMP TABLE offline_result AS
SELECT * FROM public.process_offline_livestock_command(
  '11111111-1111-4111-8111-111111111111'::UUID,
  (SELECT id FROM health_test_ids WHERE kind = 'actor'),
  jsonb_build_object(
    'protocol_id', (SELECT id FROM health_test_ids WHERE kind = 'protocol'),
    'protocol_name', 'Vacinação matrizes teste', 'executed_on', current_date,
    'quantity_treated', 180, 'result_status', 'completed', 'notes', 'Capturado sem sinal'
  ), 'aparelho-teste', clock_timestamp()
);
SELECT ok((SELECT success FROM offline_result), 'comando offline é processado');
SELECT is((SELECT status FROM public.offline_commands WHERE id = '11111111-1111-4111-8111-111111111111'), 'processed', 'comando fica conciliado');
SELECT is((SELECT count(*)::INTEGER FROM public.livestock_protocol_executions WHERE protocol_id = (SELECT id FROM health_test_ids WHERE kind = 'protocol')), 2, 'sincronização cria uma única execução adicional');
SELECT ok((SELECT success FROM public.process_offline_livestock_command(
  '11111111-1111-4111-8111-111111111111'::UUID,
  (SELECT id FROM health_test_ids WHERE kind = 'actor'), '{}'::JSONB, 'aparelho-teste', clock_timestamp()
)), 'reenvio do mesmo comando retorna sucesso');
SELECT is((SELECT count(*)::INTEGER FROM public.livestock_protocol_executions WHERE protocol_id = (SELECT id FROM health_test_ids WHERE kind = 'protocol')), 2, 'reenvio idempotente não duplica manejo');

SELECT * FROM finish();
ROLLBACK;

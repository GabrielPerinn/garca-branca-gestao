BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(22);

SELECT has_function('public', 'execute_pending_action_transactional_v3', ARRAY['uuid','text','jsonb','uuid','text'], 'executor v3 inclui protocolos pecuários');
SELECT has_column('public', 'livestock_protocols', 'source_message_id', 'protocolo mantém origem na conversa');
SELECT has_column('public', 'livestock_protocol_executions', 'source_message_id', 'execução mantém origem na conversa');

CREATE TEMP TABLE protocol_ai_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);
WITH row AS (INSERT INTO public.users_profiles (full_name, role) VALUES ('Gestor Protocolo IA', 'admin') RETURNING id)
INSERT INTO protocol_ai_ids SELECT 'actor', id FROM row;
WITH row AS (INSERT INTO public.farms (name) VALUES ('Operação Protocolo IA') RETURNING id)
INSERT INTO protocol_ai_ids SELECT 'farm', id FROM row;
WITH row AS (INSERT INTO public.cattle_lots (farm_id, name, current_quantity) SELECT id, 'Matrizes IA', 180 FROM protocol_ai_ids WHERE kind='farm' RETURNING id)
INSERT INTO protocol_ai_ids SELECT 'lot', id FROM row;
INSERT INTO public.incoming_messages (external_message_id, provider, message_type, text_content, processing_status)
VALUES ('test:protocol-create', 'web', 'text', 'Criar protocolo', 'processed'),
       ('test:protocol-complete', 'web', 'audio', 'Concluir protocolo', 'processed'),
       ('test:protocol-mixed', 'web', 'text', 'Despesa e protocolo', 'processed'),
       ('test:protocol-invalid', 'web', 'text', 'Plano inválido', 'processed');
WITH row AS (INSERT INTO public.pending_actions (source_message_id, action_type, interpreted_data_json, confirmation_status)
  VALUES ('test:protocol-create','create_livestock_protocol','{}','pending') RETURNING id)
INSERT INTO protocol_ai_ids SELECT 'pending_create', id FROM row;

CREATE TEMP TABLE protocol_create_result AS SELECT * FROM public.execute_pending_action_transactional_v3(
  (SELECT id FROM protocol_ai_ids WHERE kind='pending_create'), 'test:protocol-create',
  jsonb_build_array(jsonb_build_object('action_type','create_livestock_protocol','payload',jsonb_build_object(
    'farm_id',(SELECT id FROM protocol_ai_ids WHERE kind='farm'), 'cattle_lot_id',(SELECT id FROM protocol_ai_ids WHERE kind='lot'),
    'name','Vacinação matrizes IA','protocol_type','sanitary','event_type','vaccination','scope_type','lot',
    'product_name','Vacina teste','next_due_date',current_date + 10,'recurrence_days',180,'alert_lead_days',7
  ))), (SELECT id FROM protocol_ai_ids WHERE kind='actor'), 'Criado pela Garça');
SELECT ok((SELECT success FROM protocol_create_result), 'Garça cria protocolo coletivo após confirmação');
WITH row AS (SELECT id FROM public.livestock_protocols WHERE source_message_id='test:protocol-create')
INSERT INTO protocol_ai_ids SELECT 'protocol', id FROM row;
SELECT is((SELECT count(*)::INTEGER FROM public.livestock_protocols WHERE source_message_id='test:protocol-create'), 1, 'um protocolo é criado');
SELECT is((SELECT recurrence_days FROM public.livestock_protocols WHERE id=(SELECT id FROM protocol_ai_ids WHERE kind='protocol')), 180, 'recorrência é preservada');
SELECT is((SELECT due_date FROM public.alerts WHERE related_table='livestock_protocols' AND related_id=(SELECT id FROM protocol_ai_ids WHERE kind='protocol')), current_date + 3, 'alarme respeita sete dias de antecedência');
SELECT is((SELECT source_message_id FROM public.livestock_protocols WHERE id=(SELECT id FROM protocol_ai_ids WHERE kind='protocol')), 'test:protocol-create', 'protocolo é rastreável até a mensagem');
SELECT is((SELECT confirmation_status FROM public.pending_actions WHERE id=(SELECT id FROM protocol_ai_ids WHERE kind='pending_create')), 'completed', 'plano de criação é concluído');

WITH row AS (INSERT INTO public.pending_actions (source_message_id, action_type, interpreted_data_json, confirmation_status)
  VALUES ('test:protocol-complete','complete_livestock_protocol','{}','pending') RETURNING id)
INSERT INTO protocol_ai_ids SELECT 'pending_complete', id FROM row;
CREATE TEMP TABLE protocol_complete_result AS SELECT * FROM public.execute_pending_action_transactional_v3(
  (SELECT id FROM protocol_ai_ids WHERE kind='pending_complete'), 'test:protocol-complete',
  jsonb_build_array(jsonb_build_object('action_type','complete_livestock_protocol','payload',jsonb_build_object(
    'protocol_id',(SELECT id FROM protocol_ai_ids WHERE kind='protocol'), 'executed_on',current_date,
    'quantity_treated',180,'result_status','completed'
  ))), (SELECT id FROM protocol_ai_ids WHERE kind='actor'), 'Execução relatada por áudio');
SELECT ok((SELECT success FROM protocol_complete_result), 'Garça conclui protocolo após confirmação');
SELECT is((SELECT count(*)::INTEGER FROM public.livestock_protocol_executions WHERE protocol_id=(SELECT id FROM protocol_ai_ids WHERE kind='protocol')), 1, 'histórico recebe a execução');
SELECT is((SELECT quantity_treated FROM public.livestock_protocol_executions WHERE protocol_id=(SELECT id FROM protocol_ai_ids WHERE kind='protocol')), 180, 'quantidade tratada é preservada');
SELECT is((SELECT source_message_id FROM public.livestock_protocol_executions WHERE protocol_id=(SELECT id FROM protocol_ai_ids WHERE kind='protocol')), 'test:protocol-complete', 'execução é rastreável até o áudio');
SELECT is((SELECT next_due_date FROM public.livestock_protocols WHERE id=(SELECT id FROM protocol_ai_ids WHERE kind='protocol')), current_date + 190, 'próximo ciclo usa a data programada anterior mais recorrência');
SELECT is((SELECT due_date FROM public.alerts WHERE related_id=(SELECT id FROM protocol_ai_ids WHERE kind='protocol') AND related_table='livestock_protocols'), current_date + 183, 'alarme é reagendado automaticamente');
SELECT is((SELECT confirmation_status FROM public.pending_actions WHERE id=(SELECT id FROM protocol_ai_ids WHERE kind='pending_complete')), 'completed', 'plano de execução é concluído');

WITH row AS (INSERT INTO public.pending_actions (source_message_id, action_type, interpreted_data_json, confirmation_status)
  VALUES ('test:protocol-mixed','create_expense','{}','pending') RETURNING id)
INSERT INTO protocol_ai_ids SELECT 'pending_mixed', id FROM row;
CREATE TEMP TABLE protocol_mixed_result AS SELECT * FROM public.execute_pending_action_transactional_v3(
  (SELECT id FROM protocol_ai_ids WHERE kind='pending_mixed'), 'test:protocol-mixed',
  jsonb_build_array(
    jsonb_build_object('action_type','create_expense','payload',jsonb_build_object('amount',250,'description','Aplicação sanitária','expense_date',current_date)),
    jsonb_build_object('action_type','create_livestock_protocol','payload',jsonb_build_object(
      'farm_id',(SELECT id FROM protocol_ai_ids WHERE kind='farm'),'name','Revisão reprodutiva IA','protocol_type','reproductive',
      'event_type','pregnancy_check','scope_type','operation','next_due_date',current_date + 30,'alert_lead_days',5))
  ), (SELECT id FROM protocol_ai_ids WHERE kind='actor'), 'Plano composto');
SELECT ok((SELECT success FROM protocol_mixed_result), 'protocolo participa de plano composto');
SELECT is((SELECT count(*)::INTEGER FROM public.expenses WHERE description='Aplicação sanitária'), 1, 'parte financeira do plano composto é criada');
SELECT is((SELECT count(*)::INTEGER FROM public.livestock_protocols WHERE source_message_id='test:protocol-mixed'), 1, 'parte sanitária do plano composto é criada');

WITH row AS (INSERT INTO public.pending_actions (source_message_id, action_type, interpreted_data_json, confirmation_status)
  VALUES ('test:protocol-invalid','create_expense','{}','pending') RETURNING id)
INSERT INTO protocol_ai_ids SELECT 'pending_invalid', id FROM row;
CREATE TEMP TABLE protocol_invalid_result AS SELECT * FROM public.execute_pending_action_transactional_v3(
  (SELECT id FROM protocol_ai_ids WHERE kind='pending_invalid'), 'test:protocol-invalid',
  jsonb_build_array(
    jsonb_build_object('action_type','create_expense','payload',jsonb_build_object('amount',999,'description','Deve reverter','expense_date',current_date)),
    jsonb_build_object('action_type','create_livestock_protocol','payload',jsonb_build_object(
      'farm_id',(SELECT id FROM protocol_ai_ids WHERE kind='farm'),'name','Protocolo incompleto','protocol_type','sanitary',
      'event_type','vaccination','scope_type','lot','next_due_date',current_date + 10))
  ), (SELECT id FROM protocol_ai_ids WHERE kind='actor'), 'Plano deve falhar');
SELECT is((SELECT success FROM protocol_invalid_result), false, 'protocolo inválido bloqueia o plano');
SELECT is((SELECT count(*)::INTEGER FROM public.expenses WHERE description='Deve reverter'), 0, 'falha sanitária reverte também a despesa');
SELECT is((SELECT confirmation_status FROM public.pending_actions WHERE id=(SELECT id FROM protocol_ai_ids WHERE kind='pending_invalid')), 'failed', 'plano inválido fica marcado para correção');

SELECT * FROM finish();
ROLLBACK;

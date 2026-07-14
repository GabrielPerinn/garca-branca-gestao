BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

SELECT has_function('public', 'execute_pending_action_transactional_v2', ARRAY['uuid','text','jsonb','uuid','text'], 'executor v2 preserva pesos individuais');

CREATE TEMP TABLE weight_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);
WITH row AS (INSERT INTO public.users_profiles (full_name, role) VALUES ('Gestor Pesagem IA', 'admin') RETURNING id)
INSERT INTO weight_ids SELECT 'actor', id FROM row;
WITH row AS (INSERT INTO public.farms (name) VALUES ('Operação Pesagem IA') RETURNING id)
INSERT INTO weight_ids SELECT 'farm', id FROM row;
WITH row AS (INSERT INTO public.cattle_lots (farm_id, name, current_quantity) SELECT id, 'Bois Papel', 50 FROM weight_ids WHERE kind='farm' RETURNING id)
INSERT INTO weight_ids SELECT 'lot', id FROM row;
INSERT INTO public.incoming_messages (external_message_id, provider, message_type, text_content, processing_status)
VALUES ('test:ai-weight-ok', 'web', 'image', 'Foto da folha de pesagem', 'processed'),
       ('test:ai-weight-bad', 'web', 'image', 'Foto com soma divergente', 'processed');
WITH row AS (
  INSERT INTO public.pending_actions (source_message_id, action_type, interpreted_data_json, confidence_score, missing_fields_json, confirmation_status)
  VALUES ('test:ai-weight-ok', 'record_weighing', '{}'::JSONB, 0.99, '[]'::JSONB, 'pending') RETURNING id
)
INSERT INTO weight_ids SELECT 'pending_ok', id FROM row;
WITH row AS (
  INSERT INTO public.pending_actions (source_message_id, action_type, interpreted_data_json, confidence_score, missing_fields_json, confirmation_status)
  VALUES ('test:ai-weight-bad', 'record_weighing', '{}'::JSONB, 0.99, '[]'::JSONB, 'pending') RETURNING id
)
INSERT INTO weight_ids SELECT 'pending_bad', id FROM row;

CREATE TEMP TABLE weight_ok AS SELECT * FROM public.execute_pending_action_transactional_v2(
  (SELECT id FROM weight_ids WHERE kind='pending_ok'), 'test:ai-weight-ok',
  jsonb_build_array(jsonb_build_object('action_type','record_weighing','payload',jsonb_build_object(
    'cattle_lot_id',(SELECT id FROM weight_ids WHERE kind='lot'), 'weighing_date',current_date,
    'individual_weights',jsonb_build_array(400,420,440), 'quantity_weighed',3,
    'total_weight',1260, 'average_weight',420, 'source_message_id','test:ai-weight-ok'
  ))), (SELECT id FROM weight_ids WHERE kind='actor'), 'Teste pesagem por foto');
SELECT ok((SELECT success FROM weight_ok), 'pesagem com lista consistente é executada');
SELECT is((SELECT confirmation_status FROM public.pending_actions WHERE id=(SELECT id FROM weight_ids WHERE kind='pending_ok')), 'completed', 'plano fica concluído');
SELECT is((SELECT count(*)::INTEGER FROM public.weighings WHERE source_message_id='test:ai-weight-ok'), 1, 'uma pesagem é criada');
SELECT is((SELECT quantity_weighed FROM public.weighings WHERE source_message_id='test:ai-weight-ok'), 3, 'quantidade vem da lista');
SELECT is((SELECT average_weight FROM public.weighings WHERE source_message_id='test:ai-weight-ok'), 420.000::NUMERIC, 'média calculada é persistida');
SELECT is((SELECT total_weight FROM public.weighings WHERE source_message_id='test:ai-weight-ok'), 1260.000::NUMERIC, 'total calculado é persistido');
SELECT is((SELECT jsonb_array_length(individual_weights_json) FROM public.weighings WHERE source_message_id='test:ai-weight-ok'), 3, 'todos os pesos individuais são preservados');
SELECT is((SELECT (individual_weights_json->>2)::NUMERIC FROM public.weighings WHERE source_message_id='test:ai-weight-ok'), 440::NUMERIC, 'valor original pode ser auditado');

CREATE TEMP TABLE weight_bad AS SELECT * FROM public.execute_pending_action_transactional_v2(
  (SELECT id FROM weight_ids WHERE kind='pending_bad'), 'test:ai-weight-bad',
  jsonb_build_array(jsonb_build_object('action_type','record_weighing','payload',jsonb_build_object(
    'cattle_lot_id',(SELECT id FROM weight_ids WHERE kind='lot'), 'weighing_date',current_date,
    'individual_weights',jsonb_build_array(400,420,440), 'quantity_weighed',3,
    'total_weight',1300, 'average_weight',433.333, 'source_message_id','test:ai-weight-bad'
  ))), (SELECT id FROM weight_ids WHERE kind='actor'), 'Teste divergência');
SELECT is((SELECT success FROM weight_bad), false, 'divergência matemática bloqueia a aprovação');
SELECT is((SELECT count(*)::INTEGER FROM public.weighings WHERE source_message_id='test:ai-weight-bad'), 0, 'falha desfaz a pesagem inteira');
SELECT is((SELECT confirmation_status FROM public.pending_actions WHERE id=(SELECT id FROM weight_ids WHERE kind='pending_bad')), 'failed', 'plano inconsistente fica marcado como falha');
SELECT ok((SELECT error_message IS NOT NULL FROM public.pending_actions WHERE id=(SELECT id FROM weight_ids WHERE kind='pending_bad')), 'motivo técnico fica disponível para correção');
SELECT ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE record_id=(SELECT id FROM weight_ids WHERE kind='pending_bad') AND action='execute_pending_action_v2_failed'), 'falha é auditável');

SELECT * FROM finish();
ROLLBACK;

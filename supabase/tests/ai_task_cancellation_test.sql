BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

SELECT has_function(
  'public',
  'cancel_task_pending_action',
  ARRAY['uuid','text','jsonb','uuid','text'],
  'cancelamento transacional de tarefa existe'
);

CREATE TEMP TABLE cancel_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);
WITH row AS (
  INSERT INTO public.users_profiles (full_name, role)
  VALUES ('Gestor Cancelamento IA', 'admin') RETURNING id
)
INSERT INTO cancel_ids SELECT 'actor', id FROM row;
WITH row AS (
  INSERT INTO public.farms (name) VALUES ('Operação Cancelamento IA') RETURNING id
)
INSERT INTO cancel_ids SELECT 'farm', id FROM row;
WITH row AS (
  INSERT INTO public.tasks (title, due_date, status, related_farm_id)
  SELECT 'Arrumar cerca do lote 2', current_date + 5, 'pending', id
  FROM cancel_ids WHERE kind = 'farm'
  RETURNING id
)
INSERT INTO cancel_ids SELECT 'task', id FROM row;

INSERT INTO public.incoming_messages (
  external_message_id, provider, message_type, text_content, processing_status
) VALUES (
  'test:cancel-task', 'whatsapp', 'text',
  'Não precisa mais arrumar a cerca do lote 2, cancela essa tarefa', 'processed'
);
WITH row AS (
  INSERT INTO public.pending_actions (
    source_message_id, action_type, interpreted_data_json, confirmation_status
  ) VALUES (
    'test:cancel-task', 'cancel_task',
    jsonb_build_object('task_name', 'Arrumar cerca do lote 2'), 'pending'
  ) RETURNING id
)
INSERT INTO cancel_ids SELECT 'pending', id FROM row;

SELECT is(
  (SELECT count(*)::INTEGER FROM public.alerts
   WHERE related_table = 'tasks' AND related_id = (SELECT id FROM cancel_ids WHERE kind = 'task') AND status = 'pending'),
  1,
  'tarefa aberta possui lembrete ativo'
);

CREATE TEMP TABLE wrong_source_result AS
SELECT * FROM public.cancel_task_pending_action(
  (SELECT id FROM cancel_ids WHERE kind = 'pending'),
  'test:outra-conversa',
  jsonb_build_object('task_id', (SELECT id FROM cancel_ids WHERE kind = 'task')),
  (SELECT id FROM cancel_ids WHERE kind = 'actor'),
  'Tentativa com conversa errada'
);
SELECT is((SELECT success FROM wrong_source_result), false, 'outra conversa não pode cancelar a tarefa');
SELECT is((SELECT status FROM public.tasks WHERE id = (SELECT id FROM cancel_ids WHERE kind = 'task')), 'pending', 'falha preserva a tarefa aberta');

CREATE TEMP TABLE cancel_result AS
SELECT * FROM public.cancel_task_pending_action(
  (SELECT id FROM cancel_ids WHERE kind = 'pending'),
  'test:cancel-task',
  jsonb_build_object('task_id', (SELECT id FROM cancel_ids WHERE kind = 'task')),
  (SELECT id FROM cancel_ids WHERE kind = 'actor'),
  'Cancelado após confirmação no WhatsApp'
);
SELECT ok((SELECT success FROM cancel_result), 'confirmação cancela a tarefa');
SELECT is((SELECT status FROM public.tasks WHERE id = (SELECT id FROM cancel_ids WHERE kind = 'task')), 'cancelled', 'tarefa fica cancelada');
SELECT is((SELECT confirmation_status FROM public.pending_actions WHERE id = (SELECT id FROM cancel_ids WHERE kind = 'pending')), 'completed', 'pedido fica concluído');
SELECT is(
  (SELECT status FROM public.alerts
   WHERE related_table = 'tasks' AND related_id = (SELECT id FROM cancel_ids WHERE kind = 'task')),
  'deleted',
  'lembrete da tarefa é retirado automaticamente'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.audit_logs
   WHERE table_name = 'tasks' AND record_id = (SELECT id FROM cancel_ids WHERE kind = 'task') AND action = 'cancel_task_via_ai'),
  1,
  'cancelamento fica auditado'
);
SELECT is(
  (SELECT success FROM public.cancel_task_pending_action(
    (SELECT id FROM cancel_ids WHERE kind = 'pending'),
    'test:cancel-task',
    jsonb_build_object('task_id', (SELECT id FROM cancel_ids WHERE kind = 'task')),
    (SELECT id FROM cancel_ids WHERE kind = 'actor'),
    'Reenvio'
  )),
  false,
  'reenvio não executa o cancelamento duas vezes'
);

SELECT * FROM finish();
ROLLBACK;

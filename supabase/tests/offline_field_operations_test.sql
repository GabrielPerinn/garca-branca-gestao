BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(43);

SELECT has_function('public', 'process_offline_field_command', ARRAY['uuid','uuid','text','jsonb','text','timestamp with time zone'], 'gateway offline de campo existe');
SELECT has_table('public', 'offline_devices', 'registro de aparelhos autorizados existe');
SELECT has_function('public', 'authorize_offline_device', ARRAY['text','uuid','boolean','text'], 'autorização de aparelho existe');
SELECT has_column('public', 'offline_commands', 'result_json', 'fila guarda o resultado conciliado');
SELECT ok((SELECT pg_get_constraintdef(oid) LIKE '%record_weighing%' FROM pg_constraint WHERE conname = 'offline_command_type_valid'), 'restrição aceita as novas rotinas');

CREATE TEMP TABLE off_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);
WITH row AS (INSERT INTO public.users_profiles (full_name, role) VALUES ('Gestor Offline 2', 'admin') RETURNING id)
INSERT INTO off_ids SELECT 'actor', id FROM row;
SELECT ok(public.authorize_offline_device('30000000-0000-4000-8000-000000000001',(SELECT id FROM off_ids WHERE kind='actor'),true,'Aparelho curral'), 'aparelho é autorizado antes da sincronização');
WITH row AS (INSERT INTO public.farms (name) VALUES ('Operação Offline 2') RETURNING id)
INSERT INTO off_ids SELECT 'farm', id FROM row;
WITH row AS (INSERT INTO public.land_parcels (farm_id, name, total_area_ha) SELECT id, 'Fazenda Offline', 500 FROM off_ids WHERE kind = 'farm' RETURNING id)
INSERT INTO off_ids SELECT 'property', id FROM row;
WITH row AS (INSERT INTO public.pastures (farm_id, land_parcel_id, name) SELECT farm.id, property.id, 'Pasto Origem' FROM off_ids farm CROSS JOIN off_ids property WHERE farm.kind = 'farm' AND property.kind = 'property' RETURNING id)
INSERT INTO off_ids SELECT 'pasture_from', id FROM row;
WITH row AS (INSERT INTO public.pastures (farm_id, land_parcel_id, name) SELECT farm.id, property.id, 'Pasto Destino' FROM off_ids farm CROSS JOIN off_ids property WHERE farm.kind = 'farm' AND property.kind = 'property' RETURNING id)
INSERT INTO off_ids SELECT 'pasture_to', id FROM row;
WITH row AS (INSERT INTO public.cattle_lots (farm_id, pasture_id, name, category, current_quantity) SELECT farm.id, pasture.id, 'Bois Venda', 'Bois', 100 FROM off_ids farm CROSS JOIN off_ids pasture WHERE farm.kind = 'farm' AND pasture.kind = 'pasture_from' RETURNING id)
INSERT INTO off_ids SELECT 'lot', id FROM row;
WITH row AS (INSERT INTO public.inventory_items (farm_id, name, unit, current_quantity) SELECT id, 'Sal mineral', 'saco', 20 FROM off_ids WHERE kind = 'farm' RETURNING id)
INSERT INTO off_ids SELECT 'item', id FROM row;
WITH row AS (INSERT INTO public.tasks (title, status, related_farm_id) SELECT 'Revisar cerca offline', 'pending', id FROM off_ids WHERE kind = 'farm' RETURNING id)
INSERT INTO off_ids SELECT 'task_existing', id FROM row;

CREATE TEMP TABLE result_weigh AS SELECT * FROM public.process_offline_field_command(
  '20000000-0000-4000-8000-000000000001', (SELECT id FROM off_ids WHERE kind='actor'), 'record_weighing',
  jsonb_build_object('cattle_lot_id',(SELECT id FROM off_ids WHERE kind='lot'),'lot_name','Bois Venda','weighing_date',current_date,'individual_weights',jsonb_build_array(400,420,440),'notes','Copiado do papel'),
  '30000000-0000-4000-8000-000000000001', clock_timestamp());
SELECT ok((SELECT success FROM result_weigh), 'lista manual de pesos sincroniza');
SELECT is((SELECT count(*)::INTEGER FROM public.weighings), 1, 'cria uma pesagem');
SELECT is((SELECT quantity_weighed FROM public.weighings), 3, 'quantidade vem da lista');
SELECT is((SELECT average_weight FROM public.weighings), 420.000::NUMERIC, 'média é calculada');
SELECT is((SELECT total_weight FROM public.weighings), 1260.000::NUMERIC, 'peso total é calculado');
SELECT is((SELECT jsonb_array_length(individual_weights_json) FROM public.weighings), 3, 'pesos originais são preservados');
SELECT ok((SELECT success FROM public.process_offline_field_command('20000000-0000-4000-8000-000000000001',(SELECT id FROM off_ids WHERE kind='actor'),'record_weighing','{}','30000000-0000-4000-8000-000000000001',clock_timestamp())), 'reenvio da pesagem retorna sucesso');
SELECT is((SELECT count(*)::INTEGER FROM public.weighings), 1, 'reenvio não duplica a pesagem');

CREATE TEMP TABLE result_task AS SELECT * FROM public.process_offline_field_command(
  '20000000-0000-4000-8000-000000000002', (SELECT id FROM off_ids WHERE kind='actor'), 'create_task',
  jsonb_build_object('title','Conferir água do lote','due_date',current_date + 1,'priority','high'), '30000000-0000-4000-8000-000000000001', clock_timestamp());
SELECT ok((SELECT success FROM result_task), 'tarefa offline sincroniza');
SELECT ok(EXISTS (SELECT 1 FROM public.tasks WHERE title='Conferir água do lote' AND status='pending'), 'tarefa é gravada aberta');
SELECT ok((SELECT success FROM public.process_offline_field_command('20000000-0000-4000-8000-000000000002',(SELECT id FROM off_ids WHERE kind='actor'),'create_task','{}','30000000-0000-4000-8000-000000000001',clock_timestamp())), 'reenvio da tarefa retorna sucesso');
SELECT is((SELECT count(*)::INTEGER FROM public.tasks WHERE title='Conferir água do lote'), 1, 'reenvio não duplica tarefa');

CREATE TEMP TABLE result_complete AS SELECT * FROM public.process_offline_field_command(
  '20000000-0000-4000-8000-000000000003', (SELECT id FROM off_ids WHERE kind='actor'), 'complete_task',
  jsonb_build_object('task_id',(SELECT id FROM off_ids WHERE kind='task_existing'),'task_name','Revisar cerca offline','notes','Feito no campo'), '30000000-0000-4000-8000-000000000001', clock_timestamp());
SELECT ok((SELECT success FROM result_complete), 'baixa de tarefa sincroniza');
SELECT is((SELECT status FROM public.tasks WHERE id=(SELECT id FROM off_ids WHERE kind='task_existing')), 'completed', 'tarefa fica concluída');

CREATE TEMP TABLE result_birth AS SELECT * FROM public.process_offline_field_command(
  '20000000-0000-4000-8000-000000000004', (SELECT id FROM off_ids WHERE kind='actor'), 'record_cattle_movement',
  jsonb_build_object('cattle_lot_id',(SELECT id FROM off_ids WHERE kind='lot'),'lot_name','Bois Venda','movement_type','birth','quantity',5,'movement_date',current_date), '30000000-0000-4000-8000-000000000001', clock_timestamp());
SELECT ok((SELECT success FROM result_birth), 'nascimento coletivo sincroniza');
SELECT is((SELECT current_quantity FROM public.cattle_lots WHERE id=(SELECT id FROM off_ids WHERE kind='lot')), 105, 'nascimento aumenta o lote');
CREATE TEMP TABLE result_death AS SELECT * FROM public.process_offline_field_command(
  '20000000-0000-4000-8000-000000000005', (SELECT id FROM off_ids WHERE kind='actor'), 'record_cattle_movement',
  jsonb_build_object('cattle_lot_id',(SELECT id FROM off_ids WHERE kind='lot'),'lot_name','Bois Venda','movement_type','death','quantity',2,'movement_date',current_date), '30000000-0000-4000-8000-000000000001', clock_timestamp());
SELECT ok((SELECT success FROM result_death), 'morte coletiva sincroniza');
SELECT is((SELECT current_quantity FROM public.cattle_lots WHERE id=(SELECT id FROM off_ids WHERE kind='lot')), 103, 'morte reduz o lote');

CREATE TEMP TABLE result_stale_move AS SELECT * FROM public.process_offline_field_command(
  '20000000-0000-4000-8000-000000000006', (SELECT id FROM off_ids WHERE kind='actor'), 'record_cattle_movement',
  jsonb_build_object('cattle_lot_id',(SELECT id FROM off_ids WHERE kind='lot'),'lot_name','Bois Venda','movement_type','pasture_change','quantity',100,'movement_date',current_date,'to_pasture_id',(SELECT id FROM off_ids WHERE kind='pasture_to')), '30000000-0000-4000-8000-000000000001', clock_timestamp());
SELECT is((SELECT success FROM result_stale_move), false, 'saldo antigo gera conflito em vez de sobrescrever');
SELECT is((SELECT pasture_id FROM public.cattle_lots WHERE id=(SELECT id FROM off_ids WHERE kind='lot')), (SELECT id FROM off_ids WHERE kind='pasture_from'), 'conflito preserva o pasto atual');
CREATE TEMP TABLE result_move AS SELECT * FROM public.process_offline_field_command(
  '20000000-0000-4000-8000-000000000007', (SELECT id FROM off_ids WHERE kind='actor'), 'record_cattle_movement',
  jsonb_build_object('cattle_lot_id',(SELECT id FROM off_ids WHERE kind='lot'),'lot_name','Bois Venda','movement_type','pasture_change','quantity',103,'movement_date',current_date,'to_pasture_id',(SELECT id FROM off_ids WHERE kind='pasture_to')), '30000000-0000-4000-8000-000000000001', clock_timestamp());
SELECT ok((SELECT success FROM result_move), 'troca integral de pasto sincroniza');
SELECT is((SELECT pasture_id FROM public.cattle_lots WHERE id=(SELECT id FROM off_ids WHERE kind='lot')), (SELECT id FROM off_ids WHERE kind='pasture_to'), 'lote passa ao novo pasto');
SELECT is((SELECT count(*)::INTEGER FROM public.cattle_movements), 3, 'histórico possui os três movimentos válidos');

CREATE TEMP TABLE result_inventory AS SELECT * FROM public.process_offline_field_command(
  '20000000-0000-4000-8000-000000000008', (SELECT id FROM off_ids WHERE kind='actor'), 'record_inventory_movement',
  jsonb_build_object('inventory_item_id',(SELECT id FROM off_ids WHERE kind='item'),'item_name','Sal mineral','movement_type','out','quantity',5,'unit','saco','movement_date',current_date,'reason','Consumo do lote'), '30000000-0000-4000-8000-000000000001', clock_timestamp());
SELECT ok((SELECT success FROM result_inventory), 'consumo de estoque sincroniza');
SELECT is((SELECT current_quantity FROM public.inventory_items WHERE id=(SELECT id FROM off_ids WHERE kind='item')), 15::NUMERIC, 'estoque é baixado transacionalmente');
SELECT is((SELECT count(*)::INTEGER FROM public.inventory_movements), 1, 'movimento de estoque é auditável');

CREATE TEMP TABLE result_expense AS SELECT * FROM public.process_offline_field_command(
  '20000000-0000-4000-8000-000000000009', (SELECT id FROM off_ids WHERE kind='actor'), 'create_expense',
  jsonb_build_object('description','Frete do curral','amount',350,'category','Frete','expense_date',current_date,'has_receipt',false), '30000000-0000-4000-8000-000000000001', clock_timestamp());
SELECT ok((SELECT success FROM result_expense), 'despesa offline sincroniza');
SELECT is((SELECT amount FROM public.expenses WHERE description='Frete do curral'), 350::NUMERIC, 'despesa preserva o valor');
SELECT ok((SELECT success FROM public.process_offline_field_command('20000000-0000-4000-8000-000000000009',(SELECT id FROM off_ids WHERE kind='actor'),'create_expense',jsonb_build_object('description','Alterada','amount',999),'30000000-0000-4000-8000-000000000001',clock_timestamp())), 'reenvio processado continua idempotente');
SELECT is((SELECT amount FROM public.expenses WHERE description='Frete do curral'), 350::NUMERIC, 'payload original é imutável');

SELECT is((SELECT count(*)::INTEGER FROM public.offline_commands WHERE status='processed'), 8, 'oito comandos válidos foram conciliados');
SELECT is((SELECT count(*)::INTEGER FROM public.offline_commands WHERE status='failed'), 1, 'conflito permanece registrado');
SELECT ok((SELECT error_message IS NOT NULL FROM public.offline_commands WHERE id='20000000-0000-4000-8000-000000000006'), 'conflito guarda motivo para revisão');

UPDATE public.offline_devices
SET status = 'revoked', revoked_at = clock_timestamp()
WHERE device_id = '30000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE result_revoked AS SELECT * FROM public.process_offline_field_command(
  '20000000-0000-4000-8000-000000000010', (SELECT id FROM off_ids WHERE kind='actor'), 'create_task',
  jsonb_build_object('title','Não deve entrar','priority','high'), '30000000-0000-4000-8000-000000000001', clock_timestamp());
SELECT is((SELECT success FROM result_revoked), false, 'aparelho revogado não sincroniza');
SELECT is((SELECT count(*)::INTEGER FROM public.offline_commands WHERE id='20000000-0000-4000-8000-000000000010'), 0, 'comando de aparelho revogado nem entra na fila do servidor');
SELECT is(public.authorize_offline_device('30000000-0000-4000-8000-000000000001',(SELECT id FROM off_ids WHERE kind='actor'),true,'Aparelho curral'), false, 'atualização de pacote não reativa aparelho revogado');
SELECT is((SELECT count(*)::INTEGER FROM public.tasks WHERE title='Não deve entrar'), 0, 'revogação impede qualquer efeito operacional');

SELECT * FROM finish();
ROLLBACK;

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(22);

SELECT has_table('public', 'farm_events', 'farm_events existe');
SELECT has_table('public', 'farm_entities', 'farm_entities existe');
SELECT has_table('public', 'farm_entity_relations', 'farm_entity_relations existe');
SELECT has_function('public', 'verify_farm_event_chain', ARRAY['uuid'], 'verificador de integridade existe');
SELECT has_trigger('public', 'cattle_lots', 'capture_farm_twin_event', 'lotes possuem captura automática');
SELECT has_trigger('public', 'expenses', 'capture_farm_twin_event', 'despesas possuem captura automática');
SELECT has_trigger('public', 'tasks', 'capture_farm_twin_event', 'tarefas possuem captura automática');

CREATE TEMP TABLE twin_test_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);

WITH existing AS (
  SELECT id
  FROM public.farms
  WHERE COALESCE(status, 'active') <> 'deleted'
  ORDER BY created_at, id
  LIMIT 1
), inserted AS (
  INSERT INTO public.farms (name, owner_name, owner_phone, document_number, address)
  SELECT 'Fazenda Teste Twin', 'Pessoa não persistível', '+55 11 99999-9999', '00000000000', 'Endereço privado'
  WHERE NOT EXISTS (SELECT 1 FROM existing)
  RETURNING id
), selected AS (
  SELECT id FROM existing
  UNION ALL
  SELECT id FROM inserted
)
INSERT INTO twin_test_ids SELECT 'farm', id FROM selected LIMIT 1;

UPDATE public.farms
SET owner_name = 'Pessoa não persistível',
    owner_phone = '+55 11 99999-9999',
    document_number = '00000000000',
    address = 'Endereço privado'
WHERE id = (SELECT id FROM twin_test_ids WHERE kind = 'farm');

WITH inserted AS (
  INSERT INTO public.pastures (farm_id, name, approximate_capacity)
  SELECT id, 'Pasto Teste Twin', 120 FROM twin_test_ids WHERE kind = 'farm'
  RETURNING id
)
INSERT INTO twin_test_ids SELECT 'pasture', id FROM inserted;

WITH inserted AS (
  INSERT INTO public.cattle_lots (farm_id, pasture_id, name, current_quantity)
  SELECT farm.id, pasture.id, 'Lote Teste Twin', 30
  FROM twin_test_ids farm CROSS JOIN twin_test_ids pasture
  WHERE farm.kind = 'farm' AND pasture.kind = 'pasture'
  RETURNING id
)
INSERT INTO twin_test_ids SELECT 'lot', id FROM inserted;

UPDATE public.cattle_lots
SET current_quantity = 35
WHERE id = (SELECT id FROM twin_test_ids WHERE kind = 'lot');

WITH inserted AS (
  INSERT INTO public.tasks (title, related_farm_id, related_pasture_id, related_cattle_lot_id)
  SELECT 'Revisar cerca do teste', farm.id, pasture.id, lot.id
  FROM twin_test_ids farm CROSS JOIN twin_test_ids pasture CROSS JOIN twin_test_ids lot
  WHERE farm.kind = 'farm' AND pasture.kind = 'pasture' AND lot.kind = 'lot'
  RETURNING id
)
INSERT INTO twin_test_ids SELECT 'task', id FROM inserted;

SELECT is(
  (SELECT count(*)::INTEGER FROM public.farm_entities WHERE entity_id IN (SELECT id FROM twin_test_ids)),
  4,
  'quatro entidades de domínio foram indexadas'
);
SELECT is(
  (SELECT current_version FROM public.farm_entities WHERE entity_id = (SELECT id FROM twin_test_ids WHERE kind = 'lot')),
  2,
  'atualização incrementa a versão da entidade'
);
SELECT is(
  (SELECT after_state->>'current_quantity' FROM public.farm_events WHERE entity_id = (SELECT id FROM twin_test_ids WHERE kind = 'lot') ORDER BY event_sequence DESC LIMIT 1),
  '35',
  'estado posterior registra a nova quantidade'
);
SELECT ok(
  (SELECT changed_fields = ARRAY['current_quantity']::TEXT[] FROM public.farm_events WHERE entity_id = (SELECT id FROM twin_test_ids WHERE kind = 'lot') ORDER BY event_sequence DESC LIMIT 1),
  'alteração registra somente o campo de negócio modificado'
);
SELECT ok(
  (SELECT NOT (current_state ?| ARRAY['owner_name', 'owner_phone', 'document_number', 'address']) FROM public.farm_entities WHERE entity_id = (SELECT id FROM twin_test_ids WHERE kind = 'farm')),
  'dados pessoais da propriedade não são copiados ao índice imutável'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.farm_entity_relations
    WHERE from_entity_id = (SELECT id FROM twin_test_ids WHERE kind = 'task')
      AND relation_type = 'related_to_cattle_lot' AND valid_to IS NULL
  ),
  'tarefa fica conectada ao lote'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.farm_entity_relations
    WHERE from_entity_id = (SELECT id FROM twin_test_ids WHERE kind = 'lot')
      AND relation_type = 'located_in_pasture' AND valid_to IS NULL
  ),
  'lote fica conectado ao pasto atual'
);

UPDATE public.cattle_lots
SET pasture_id = NULL
WHERE id = (SELECT id FROM twin_test_ids WHERE kind = 'lot');

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.farm_entity_relations
    WHERE from_entity_id = (SELECT id FROM twin_test_ids WHERE kind = 'lot')
      AND relation_type = 'located_in_pasture' AND valid_to IS NOT NULL
  ),
  'relação removida preserva sua validade histórica'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.farm_entity_relations
    WHERE from_entity_id = (SELECT id FROM twin_test_ids WHERE kind = 'lot')
      AND relation_type = 'located_in_pasture' AND valid_to IS NULL
  ),
  'relação antiga deixa de aparecer como ativa'
);

SELECT is(public.farm_event_visibility('expenses'), 'restricted', 'eventos financeiros são restritos');
SELECT is(public.farm_event_visibility('tasks'), 'standard', 'eventos operacionais têm visibilidade padrão');
SELECT ok((SELECT is_valid FROM public.verify_farm_event_chain(NULL)), 'cadeia de hash é válida');
SELECT is((SELECT invalid_events::INTEGER FROM public.verify_farm_event_chain(NULL)), 0, 'nenhum evento inválido foi encontrado');

SELECT throws_ok(
  $$UPDATE public.farm_events SET event_type = 'tampered' WHERE id = (SELECT id FROM public.farm_events LIMIT 1)$$,
  '55000',
  'O livro de eventos do Garça Twin é imutável.',
  'eventos não podem ser alterados'
);
SELECT throws_ok(
  $$DELETE FROM public.farm_events WHERE id = (SELECT id FROM public.farm_events LIMIT 1)$$,
  '55000',
  'O livro de eventos do Garça Twin é imutável.',
  'eventos não podem ser removidos'
);

SELECT * FROM finish();
ROLLBACK;

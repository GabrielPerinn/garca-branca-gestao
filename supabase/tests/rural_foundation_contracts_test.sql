BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(34);

SELECT has_table('public', 'land_parcels', 'imóveis rurais existem');
SELECT has_table('public', 'agricultural_fields', 'talhões agrícolas existem');
SELECT has_table('public', 'farm_assets', 'ativos operacionais existem');
SELECT has_table('public', 'rural_contracts', 'contratos rurais existem');
SELECT has_table('public', 'rural_contract_installments', 'parcelas contratuais existem');
SELECT has_function('public', 'insert_rural_contract', ARRAY['uuid', 'jsonb', 'uuid'], 'criação transacional do contrato existe');
SELECT has_function('public', 'receive_rural_contract_installment', ARRAY['uuid', 'date', 'uuid'], 'baixa transacional da parcela existe');
SELECT has_function('public', 'execute_rural_contract_pending_action', ARRAY['uuid', 'text', 'jsonb', 'uuid', 'text'], 'executor supervisionado da IA existe');
SELECT has_trigger('public', 'land_parcels', 'capture_farm_twin_event', 'imóveis alimentam o gêmeo digital');
SELECT has_trigger('public', 'agricultural_fields', 'capture_farm_twin_event', 'talhões alimentam o gêmeo digital');
SELECT has_trigger('public', 'farm_assets', 'capture_farm_twin_event', 'ativos alimentam o gêmeo digital');
SELECT has_trigger('public', 'rural_contracts', 'sync_rural_contract_alert', 'contratos geram alerta de renovação');
SELECT has_trigger('public', 'rural_contract_installments', 'sync_rural_installment_alert', 'parcelas geram alerta de cobrança');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.land_parcels'::regclass), 'RLS protege os imóveis');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agricultural_fields'::regclass), 'RLS protege os talhões');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.farm_assets'::regclass), 'RLS protege os ativos');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rural_contracts'::regclass), 'RLS protege os contratos');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rural_contract_installments'::regclass), 'RLS protege as parcelas');
SELECT is(public.farm_event_visibility('rural_contracts'), 'restricted', 'contratos têm visibilidade restrita');
SELECT is(public.farm_event_visibility('rural_contract_installments'), 'restricted', 'parcelas têm visibilidade restrita');

CREATE TEMP TABLE rural_test_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);
WITH existing AS (
  SELECT id FROM public.farms WHERE COALESCE(status, 'active') <> 'deleted' ORDER BY created_at, id LIMIT 1
), inserted AS (
  INSERT INTO public.farms (name) SELECT 'Fazenda Teste Contratos' WHERE NOT EXISTS (SELECT 1 FROM existing) RETURNING id
), selected AS (
  SELECT id FROM existing UNION ALL SELECT id FROM inserted
)
INSERT INTO rural_test_ids SELECT 'farm', id FROM selected LIMIT 1;

INSERT INTO rural_test_ids (kind, id)
SELECT 'contract', public.insert_rural_contract(
  (SELECT id FROM rural_test_ids WHERE kind = 'farm'),
  jsonb_build_object(
    'title', 'Arrendamento teste safra',
    'parcel_name', 'Área Norte Teste Contratos',
    'contract_type', 'rural_lease',
    'farm_role', 'grantor',
    'counterparty_name', 'Produtor Teste',
    'start_date', '2026-09-01',
    'end_date', '2029-08-31',
    'area_ha', 120,
    'activity', 'Cultivo de soja',
    'crop_name', 'Soja',
    'payment_type', 'fixed_money',
    'payment_amount', 80000,
    'payment_frequency', 'annual',
    'first_due_date', '2026-09-10',
    'installment_count', 3,
    'renewal_notice_days', 90
  ),
  NULL
);

INSERT INTO rural_test_ids (kind, id)
SELECT 'installment', id FROM public.rural_contract_installments
WHERE contract_id = (SELECT id FROM rural_test_ids WHERE kind = 'contract')
ORDER BY installment_number LIMIT 1;

SELECT ok((SELECT id IS NOT NULL FROM rural_test_ids WHERE kind = 'contract'), 'contrato é criado atomicamente');
SELECT is((SELECT count(*)::INTEGER FROM public.rural_contract_installments WHERE contract_id = (SELECT id FROM rural_test_ids WHERE kind = 'contract')), 3, 'cronograma contém três parcelas');
SELECT is((SELECT max(due_date)::TEXT FROM public.rural_contract_installments WHERE contract_id = (SELECT id FROM rural_test_ids WHERE kind = 'contract')), '2028-09-10', 'frequência anual calcula vencimentos distintos');
SELECT ok(EXISTS (SELECT 1 FROM public.alerts WHERE related_table = 'rural_contracts' AND related_id = (SELECT id FROM rural_test_ids WHERE kind = 'contract') AND status = 'pending'), 'renovação gera alerta ativo');
SELECT is((SELECT count(*)::INTEGER FROM public.alerts WHERE related_table = 'rural_contract_installments' AND related_id IN (SELECT id FROM public.rural_contract_installments WHERE contract_id = (SELECT id FROM rural_test_ids WHERE kind = 'contract')) AND status = 'pending'), 3, 'cada parcela gera alerta próprio');

INSERT INTO rural_test_ids (kind, id)
SELECT 'revenue', public.receive_rural_contract_installment(
  (SELECT id FROM rural_test_ids WHERE kind = 'installment'),
  '2026-09-10',
  NULL
);

SELECT ok(EXISTS (SELECT 1 FROM public.revenues WHERE id = (SELECT id FROM rural_test_ids WHERE kind = 'revenue') AND amount = 80000), 'baixa cria a receita correta');
SELECT is((SELECT status FROM public.rural_contract_installments WHERE id = (SELECT id FROM rural_test_ids WHERE kind = 'installment')), 'received', 'parcela recebe status conciliado');
SELECT is(public.receive_rural_contract_installment((SELECT id FROM rural_test_ids WHERE kind = 'installment'), '2026-09-10', NULL), (SELECT id FROM rural_test_ids WHERE kind = 'revenue'), 'segunda baixa é idempotente');
SELECT is((SELECT count(*)::INTEGER FROM public.revenues WHERE id = (SELECT id FROM rural_test_ids WHERE kind = 'revenue')), 1, 'idempotência não duplica receita');
SELECT throws_ok(
  $$DELETE FROM public.rural_contracts WHERE id = (SELECT id FROM rural_test_ids WHERE kind = 'contract')$$,
  'P0001',
  'Exclusão física proibida nesta tabela. Use UPDATE status = ''deleted''.',
  'contrato não permite exclusão física'
);
SELECT is((SELECT tenure_type FROM public.land_parcels WHERE name = 'Área Norte Teste Contratos'), 'leased_out', 'área criada pelo contrato registra terra cedida');
SELECT ok(EXISTS (SELECT 1 FROM public.farm_events WHERE entity_type = 'rural_contracts' AND entity_id = (SELECT id FROM rural_test_ids WHERE kind = 'contract')), 'contrato possui histórico temporal');
SELECT ok(EXISTS (SELECT 1 FROM public.farm_events WHERE entity_type = 'rural_contract_installments' AND entity_id = (SELECT id FROM rural_test_ids WHERE kind = 'installment')), 'parcela possui histórico temporal');
SELECT throws_ok(
  $$SELECT public.insert_rural_contract(
    (SELECT id FROM rural_test_ids WHERE kind = 'farm'),
    '{"parcel_name":"Área inválida","counterparty_name":"Teste","activity":"Soja","start_date":"2026-01-01","end_date":"2027-01-01","area_ha":10,"contract_type":"rural_lease","farm_role":"grantor","payment_type":"fixed_money"}'::jsonb,
    NULL
  )$$,
  '22023',
  'Pagamento em dinheiro exige valor positivo.',
  'contrato monetário incompleto é rejeitado'
);

SELECT * FROM finish();
ROLLBACK;

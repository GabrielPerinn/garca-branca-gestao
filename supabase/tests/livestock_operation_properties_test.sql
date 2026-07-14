BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(13);

SELECT has_column('public', 'pastures', 'land_parcel_id', 'pastos identificam a propriedade física');
SELECT has_column('public', 'farm_assets', 'land_parcel_id', 'ativos podem identificar sua propriedade-base');
SELECT has_index('public', 'farms', 'uq_single_active_livestock_operation', 'existe somente uma operação pecuária consolidada');
SELECT has_function(
  'public', 'configure_livestock_operation_foundation_transactional',
  ARRAY['uuid','jsonb','jsonb','jsonb','jsonb','jsonb','jsonb','jsonb','jsonb','uuid'],
  'implantação transacional multipropriedade existe'
);
SELECT has_trigger('public', 'pastures', 'enforce_pasture_property_scope', 'pasto valida o escopo da propriedade');
SELECT has_trigger('public', 'farm_assets', 'enforce_asset_property_scope', 'ativo valida o escopo da propriedade');

CREATE TEMP TABLE livestock_property_test_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);

WITH inserted AS (
  INSERT INTO public.farms (name, total_area_ha, primary_activity, livestock_system)
  VALUES ('Operação Pecuária Multipropriedade', 900, 'beef_cattle', 'extensive')
  RETURNING id
)
INSERT INTO livestock_property_test_ids SELECT 'operation', id FROM inserted;

WITH inserted AS (
  INSERT INTO public.land_parcels (farm_id, name, tenure_type, total_area_ha, usable_area_ha)
  SELECT id, 'Fazenda Sede Teste', 'owned', 500, 420 FROM livestock_property_test_ids WHERE kind = 'operation'
  RETURNING id
)
INSERT INTO livestock_property_test_ids SELECT 'property_a', id FROM inserted;

WITH inserted AS (
  INSERT INTO public.land_parcels (farm_id, name, tenure_type, total_area_ha, usable_area_ha)
  SELECT id, 'Fazenda Retiro Teste', 'leased_in', 400, 350 FROM livestock_property_test_ids WHERE kind = 'operation'
  RETURNING id
)
INSERT INTO livestock_property_test_ids SELECT 'property_b', id FROM inserted;

WITH inserted AS (
  INSERT INTO public.pastures (farm_id, land_parcel_id, name, approximate_capacity)
  SELECT operation.id, property.id, 'Pasto Sede Teste', 100
  FROM livestock_property_test_ids operation CROSS JOIN livestock_property_test_ids property
  WHERE operation.kind = 'operation' AND property.kind = 'property_a'
  RETURNING id
)
INSERT INTO livestock_property_test_ids SELECT 'pasture_a', id FROM inserted;

WITH inserted AS (
  INSERT INTO public.pastures (farm_id, land_parcel_id, name, approximate_capacity)
  SELECT operation.id, property.id, 'Pasto Retiro Teste', 120
  FROM livestock_property_test_ids operation CROSS JOIN livestock_property_test_ids property
  WHERE operation.kind = 'operation' AND property.kind = 'property_b'
  RETURNING id
)
INSERT INTO livestock_property_test_ids SELECT 'pasture_b', id FROM inserted;

SELECT is((SELECT count(*)::INTEGER FROM public.land_parcels WHERE farm_id = (SELECT id FROM livestock_property_test_ids WHERE kind = 'operation')), 2, 'a operação reúne duas propriedades');
SELECT is((SELECT count(DISTINCT land_parcel_id)::INTEGER FROM public.pastures WHERE id IN (SELECT id FROM livestock_property_test_ids WHERE kind LIKE 'pasture_%')), 2, 'cada pasto permanece em sua propriedade');
SELECT ok(EXISTS (
  SELECT 1 FROM public.farm_entity_relations
  WHERE from_entity_id = (SELECT id FROM livestock_property_test_ids WHERE kind = 'pasture_a')
    AND relation_type = 'located_in_property' AND valid_to IS NULL
), 'o gêmeo digital conecta pasto e propriedade');

SELECT throws_ok(
  $$INSERT INTO public.farms (name) VALUES ('Outra operação ativa indevida')$$,
  '23505',
  NULL,
  'uma segunda operação ativa é rejeitada'
);

WITH inserted AS (
  INSERT INTO public.farms (name, status) VALUES ('Operação externa excluída', 'deleted') RETURNING id
)
INSERT INTO livestock_property_test_ids SELECT 'other_operation', id FROM inserted;

WITH inserted AS (
  INSERT INTO public.land_parcels (farm_id, name, total_area_ha)
  SELECT id, 'Propriedade de outra operação', 100 FROM livestock_property_test_ids WHERE kind = 'other_operation'
  RETURNING id
)
INSERT INTO livestock_property_test_ids SELECT 'other_property', id FROM inserted;

SELECT throws_ok(
  $$INSERT INTO public.pastures (farm_id, land_parcel_id, name)
    SELECT operation.id, property.id, 'Pasto com vínculo cruzado'
    FROM livestock_property_test_ids operation CROSS JOIN livestock_property_test_ids property
    WHERE operation.kind = 'operation' AND property.kind = 'other_property'$$,
  '23514',
  'A propriedade informada não pertence a esta operação pecuária.',
  'vínculo de pasto entre operações é bloqueado'
);

INSERT INTO public.farm_assets (farm_id, land_parcel_id, name, asset_type)
SELECT operation.id, property.id, 'Curral da Sede Teste', 'corral'
FROM livestock_property_test_ids operation CROSS JOIN livestock_property_test_ids property
WHERE operation.kind = 'operation' AND property.kind = 'property_a';

SELECT ok(EXISTS (
  SELECT 1 FROM public.farm_assets asset
  WHERE asset.name = 'Curral da Sede Teste'
    AND asset.land_parcel_id = (SELECT id FROM livestock_property_test_ids WHERE kind = 'property_a')
), 'estrutura fixa fica vinculada à propriedade correta');
SELECT is((SELECT sum(total_area_ha)::NUMERIC FROM public.land_parcels WHERE farm_id = (SELECT id FROM livestock_property_test_ids WHERE kind = 'operation')), 900::NUMERIC, 'área consolidada equivale à soma das propriedades');

SELECT * FROM finish();
ROLLBACK;

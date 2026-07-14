BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(17);

SELECT has_table('public', 'foundation_setup_drafts', 'tabela de rascunhos existe');
SELECT has_function(
  'public', 'save_foundation_setup_draft',
  ARRAY['uuid', 'uuid', 'jsonb', 'integer', 'bigint'],
  'função de salvamento versionado existe'
);
SELECT has_trigger(
  'public', 'foundation_setup_drafts', 'set_updated_at_foundation_setup_drafts',
  'rascunho mantém updated_at automaticamente'
);
SELECT col_is_unique('public', 'foundation_setup_drafts', 'owner_profile_id', 'cada perfil possui um único rascunho ativo');

CREATE TEMP TABLE foundation_draft_test_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);

WITH profile AS (
  INSERT INTO public.users_profiles (full_name, role, is_active)
  VALUES ('Administrador de teste do rascunho', 'admin', true)
  RETURNING id
)
INSERT INTO foundation_draft_test_ids SELECT 'profile', id FROM profile;

SELECT lives_ok(
  format(
    $$SELECT * FROM public.save_foundation_setup_draft(%L, NULL, '{"profile":{"name":"Operação parcial"},"pastures":[],"cattle_lots":[],"employees":[],"inventory_items":[],"land_parcels":[],"farm_assets":[],"rural_contracts":[]}'::jsonb, 0, NULL)$$,
    (SELECT id FROM foundation_draft_test_ids WHERE kind = 'profile')
  ),
  'primeira etapa aceita dados incompletos'
);
SELECT is(
  (SELECT revision FROM public.foundation_setup_drafts WHERE owner_profile_id = (SELECT id FROM foundation_draft_test_ids WHERE kind = 'profile')),
  1::BIGINT,
  'primeiro salvamento inicia na revisão um'
);
SELECT is(
  (SELECT current_step::INTEGER FROM public.foundation_setup_drafts WHERE owner_profile_id = (SELECT id FROM foundation_draft_test_ids WHERE kind = 'profile')),
  0,
  'etapa atual fica registrada'
);

SELECT lives_ok(
  format(
    $$SELECT * FROM public.save_foundation_setup_draft(%L, NULL, '{"profile":{"name":"Operação parcial","municipality":"Cáceres"},"pastures":[],"cattle_lots":[],"employees":[],"inventory_items":[],"land_parcels":[],"farm_assets":[],"rural_contracts":[]}'::jsonb, 2, 1)$$,
    (SELECT id FROM foundation_draft_test_ids WHERE kind = 'profile')
  ),
  'salvamento seguinte aceita a revisão esperada'
);
SELECT is(
  (SELECT revision FROM public.foundation_setup_drafts WHERE owner_profile_id = (SELECT id FROM foundation_draft_test_ids WHERE kind = 'profile')),
  2::BIGINT,
  'revisão é incrementada atomicamente'
);
SELECT is(
  (SELECT current_step::INTEGER FROM public.foundation_setup_drafts WHERE owner_profile_id = (SELECT id FROM foundation_draft_test_ids WHERE kind = 'profile')),
  2,
  'retomada preserva a última etapa'
);

SELECT throws_ok(
  format(
    $$SELECT * FROM public.save_foundation_setup_draft(%L, NULL, '{}'::jsonb, 3, 1)$$,
    (SELECT id FROM foundation_draft_test_ids WHERE kind = 'profile')
  ),
  '40001',
  'Este rascunho foi atualizado em outra aba ou aparelho. Recarregue a página antes de continuar.',
  'revisão antiga não sobrescreve dados mais novos'
);
SELECT is(
  (SELECT revision FROM public.foundation_setup_drafts WHERE owner_profile_id = (SELECT id FROM foundation_draft_test_ids WHERE kind = 'profile')),
  2::BIGINT,
  'conflito não altera a revisão atual'
);
SELECT throws_ok(
  format(
    $$SELECT * FROM public.save_foundation_setup_draft(%L, NULL, '{}'::jsonb, 9, 2)$$,
    (SELECT id FROM foundation_draft_test_ids WHERE kind = 'profile')
  ),
  '22023',
  'Etapa da implantação inválida.',
  'etapa fora do assistente é rejeitada'
);
SELECT throws_ok(
  format(
    $$SELECT * FROM public.save_foundation_setup_draft(%L, NULL, '[]'::jsonb, 2, 2)$$,
    (SELECT id FROM foundation_draft_test_ids WHERE kind = 'profile')
  ),
  '22023',
  'O rascunho da implantação é inválido ou excede o limite permitido.',
  'payload que não é objeto é rejeitado'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.foundation_setup_drafts', 'SELECT'),
  'anon não lê rascunhos administrativos'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.foundation_setup_drafts', 'SELECT'),
  'cliente autenticado não acessa rascunhos diretamente'
);
SELECT ok(
  has_table_privilege('service_role', 'public.foundation_setup_drafts', 'SELECT'),
  'backend autorizado pode recuperar o rascunho'
);

SELECT * FROM finish();
ROLLBACK;

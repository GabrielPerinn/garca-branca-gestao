BEGIN;

SELECT plan(19);

SELECT has_table('public', 'data_protection_runs', 'registro de backups existe');
SELECT has_table('public', 'data_integrity_checks', 'registro de integridade existe');
SELECT has_function('public', 'run_data_integrity_check', ARRAY['text', 'boolean'], 'verificação de integridade existe');
SELECT has_function('public', 'get_data_protection_status', ARRAY[]::TEXT[], 'resumo de proteção existe');
SELECT has_trigger('public', 'data_protection_runs', 'prevent_data_protection_runs_mutation', 'evidência de backup é imutável');
SELECT has_trigger('public', 'data_integrity_checks', 'prevent_data_integrity_checks_mutation', 'evidência de integridade é imutável');

SELECT ok((public.run_data_integrity_check('pgTAP', true)->>'is_valid')::BOOLEAN, 'base limpa passa na integridade');
SELECT is((SELECT count(*)::INTEGER FROM public.data_integrity_checks WHERE source = 'pgTAP'), 1, 'verificação foi registrada');
SELECT is((SELECT jsonb_typeof(issues) FROM public.data_integrity_checks WHERE source = 'pgTAP'), 'array', 'problemas são estruturados');

SELECT lives_ok(
  $$SELECT public.record_data_protection_run(
    'test-backup-001', 'encrypted_offsite', 'verified',
    clock_timestamp() - interval '2 minutes', clock_timestamp() - interval '1 minute',
    clock_timestamp(), clock_timestamp() + interval '90 days', 1200, 300,
    repeat('a', 64), '{"restore_drill":true}'::jsonb, NULL
  )$$,
  'backup verificado pode ser registrado'
);
SELECT is((SELECT status FROM public.data_protection_runs WHERE backup_id = 'test-backup-001'), 'verified', 'status foi preservado');
SELECT is((SELECT encrypted FROM public.data_protection_runs WHERE backup_id = 'test-backup-001'), true, 'cópia externa precisa estar criptografada');
SELECT ok((public.get_data_protection_status()->>'backup_fresh')::BOOLEAN, 'backup recente é considerado válido');
SELECT is(public.get_data_protection_status()->'backup'->>'backup_id', 'test-backup-001', 'resumo aponta para a última cópia');

SELECT throws_ok(
  $$UPDATE public.data_protection_runs SET status = 'failed' WHERE backup_id = 'test-backup-001'$$,
  '55000', 'Evidências de proteção de dados são imutáveis.',
  'evidência não pode ser alterada'
);
SELECT throws_ok(
  $$DELETE FROM public.data_protection_runs WHERE backup_id = 'test-backup-001'$$,
  '55000', 'Evidências de proteção de dados são imutáveis.',
  'evidência não pode ser apagada'
);
SELECT throws_ok(
  $$UPDATE public.data_integrity_checks SET is_valid = false WHERE source = 'pgTAP'$$,
  '55000', 'Evidências de proteção de dados são imutáveis.',
  'checagem não pode ser adulterada'
);
SELECT throws_ok(
  $$SELECT public.record_data_protection_run(
    'test-backup-invalid', 'encrypted_offsite', 'verified', clock_timestamp(),
    clock_timestamp(), clock_timestamp(), NULL, 1, 1, 'invalid', '{}'::jsonb, NULL
  )$$,
  '23514', NULL,
  'checksum inválido é recusado'
);

SELECT is((SELECT count(*)::INTEGER FROM public.data_protection_runs WHERE backup_id = 'test-backup-invalid'), 0, 'backup inválido não foi gravado');

SELECT * FROM finish();
ROLLBACK;

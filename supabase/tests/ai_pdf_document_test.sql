BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(19);

SELECT has_function('public', 'execute_pending_action_transactional_v4', ARRAY['uuid','text','jsonb','uuid','text'], 'executor v4 vincula documentos fiscais');
SELECT has_column('public', 'expenses', 'source_attachment_id', 'despesa referencia o PDF original');
SELECT has_column('public', 'expenses', 'source_document_metadata', 'despesa preserva os dados extraídos');
SELECT has_column('public', 'expenses', 'fiscal_document_type', 'tipo fiscal é armazenado');
SELECT has_column('public', 'expenses', 'fiscal_document_number', 'número fiscal é armazenado');
SELECT has_column('public', 'expenses', 'fiscal_access_key', 'chave fiscal é armazenada');
SELECT has_column('public', 'expenses', 'supplier_document', 'documento do fornecedor é armazenado');
SELECT has_column('public', 'expenses', 'payment_status', 'situação do pagamento é armazenada');
SELECT has_index('public', 'expenses', 'uq_expenses_fiscal_access_key', 'chave fiscal ativa não pode ser duplicada');
SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'ai-evidence'),
  52428800::BIGINT,
  'cofre de evidências aceita PDF de até 50 MB'
);

CREATE TEMP TABLE pdf_ai_ids (kind TEXT PRIMARY KEY, id UUID NOT NULL);
WITH row AS (
  INSERT INTO public.users_profiles (full_name, role)
  VALUES ('Gestor PDF IA', 'admin')
  RETURNING id
)
INSERT INTO pdf_ai_ids SELECT 'actor', id FROM row;

WITH row AS (
  INSERT INTO public.incoming_messages (
    external_message_id, provider, message_type, text_content, processing_status
  ) VALUES (
    'test:pdf-expense', 'whatsapp', 'document', 'Nota fiscal de sal mineral', 'processed'
  ) RETURNING id
)
INSERT INTO pdf_ai_ids SELECT 'message', id FROM row;

WITH row AS (
  INSERT INTO public.attachments (
    file_name, file_type, file_url, storage_path, uploaded_by,
    source_message_id, incoming_message_id, provider_media_id, media_kind,
    mime_type, file_size_bytes, checksum_sha256, status
  ) VALUES (
    'nota-123.pdf', 'application/pdf', 'private://ai-evidence/test/nota-123.pdf',
    'test/nota-123.pdf', (SELECT id FROM pdf_ai_ids WHERE kind = 'actor'),
    'test:pdf-expense', (SELECT id FROM pdf_ai_ids WHERE kind = 'message'),
    'media-pdf-123', 'document', 'application/pdf', 1024, repeat('a', 64), 'active'
  ) RETURNING id
)
INSERT INTO pdf_ai_ids SELECT 'attachment', id FROM row;

WITH row AS (
  INSERT INTO public.pending_actions (
    source_message_id, action_type, interpreted_data_json, confirmation_status,
    input_modality
  ) VALUES (
    'test:pdf-expense', 'create_expense', '{}', 'pending', 'document'
  ) RETURNING id
)
INSERT INTO pdf_ai_ids SELECT 'pending', id FROM row;

CREATE TEMP TABLE pdf_execution_result AS
SELECT * FROM public.execute_pending_action_transactional_v4(
  (SELECT id FROM pdf_ai_ids WHERE kind = 'pending'),
  'test:pdf-expense',
  jsonb_build_array(jsonb_build_object(
    'action_type', 'create_expense',
    'payload', jsonb_build_object(
      'amount', 1250.50,
      'description', 'Compra de sal mineral — Nota 123',
      'category', 'Alimentação Animal',
      'expense_date', current_date - 1,
      'supplier_name', 'Cooperativa Garça',
      'supplier_document', '12345678000199',
      'payment_method', 'pix',
      'payment_status', 'paid',
      'document_issue_date', current_date - 1,
      'payment_due_date', current_date,
      'fiscal_document_type', 'NF-e',
      'fiscal_document_number', '123',
      'fiscal_access_key', '12345678901234567890123456789012345678901234',
      'source_document', true,
      'has_receipt', true
    )
  )),
  (SELECT id FROM pdf_ai_ids WHERE kind = 'actor'),
  'Nota confirmada no WhatsApp'
);

SELECT ok((SELECT success FROM pdf_execution_result), 'nota confirmada vira despesa');
SELECT is(
  (SELECT confirmation_status FROM public.pending_actions WHERE id = (SELECT id FROM pdf_ai_ids WHERE kind = 'pending')),
  'completed',
  'plano documental é concluído'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.expenses WHERE source_message_id = 'test:pdf-expense'),
  1,
  'uma única despesa é criada'
);
SELECT is(
  (SELECT supplier_name FROM public.expenses WHERE source_message_id = 'test:pdf-expense'),
  'Cooperativa Garça',
  'fornecedor extraído é preservado'
);
SELECT is(
  (SELECT payment_status FROM public.expenses WHERE source_message_id = 'test:pdf-expense'),
  'paid',
  'situação do pagamento é preservada'
);
SELECT is(
  (SELECT source_attachment_id FROM public.expenses WHERE source_message_id = 'test:pdf-expense'),
  (SELECT id FROM pdf_ai_ids WHERE kind = 'attachment'),
  'despesa aponta para o PDF privado'
);
SELECT is(
  (SELECT source_document_metadata->>'source_document' FROM public.expenses WHERE source_message_id = 'test:pdf-expense'),
  'true',
  'metadados indicam a origem documental'
);
SELECT is(
  (SELECT fiscal_access_key FROM public.expenses WHERE source_message_id = 'test:pdf-expense'),
  '12345678901234567890123456789012345678901234',
  'chave da NF-e é preservada'
);
SELECT ok(
  (SELECT has_receipt FROM public.expenses WHERE source_message_id = 'test:pdf-expense'),
  'PDF fica marcado como comprovante'
);

SELECT * FROM finish();
ROLLBACK;

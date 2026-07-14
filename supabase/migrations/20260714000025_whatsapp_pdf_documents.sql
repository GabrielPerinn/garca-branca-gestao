-- First-class PDF evidence from WhatsApp: accept the document modality, retain
-- the immutable original and enrich an approved expense with fiscal metadata.

BEGIN;

ALTER TABLE public.pending_actions
  DROP CONSTRAINT IF EXISTS pending_actions_input_modality_valid;
ALTER TABLE public.pending_actions
  ADD CONSTRAINT pending_actions_input_modality_valid
  CHECK (input_modality IN ('text', 'audio', 'image', 'document')) NOT VALID;

ALTER TABLE public.ai_clarifications
  DROP CONSTRAINT IF EXISTS ai_clarifications_input_modality_valid;
ALTER TABLE public.ai_clarifications
  ADD CONSTRAINT ai_clarifications_input_modality_valid
  CHECK (input_modality IN ('text', 'audio', 'image', 'document')) NOT VALID;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS source_attachment_id UUID
    REFERENCES public.attachments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_document_metadata JSONB,
  ADD COLUMN IF NOT EXISTS fiscal_document_type TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_document_number TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_access_key TEXT,
  ADD COLUMN IF NOT EXISTS supplier_document TEXT,
  ADD COLUMN IF NOT EXISTS document_issue_date DATE,
  ADD COLUMN IF NOT EXISTS payment_due_date DATE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_source_document_metadata_object') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_source_document_metadata_object
      CHECK (source_document_metadata IS NULL OR jsonb_typeof(source_document_metadata) = 'object') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_fiscal_access_key_valid') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_fiscal_access_key_valid
      CHECK (fiscal_access_key IS NULL OR fiscal_access_key ~ '^[0-9]{44}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_payment_status_valid') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_payment_status_valid
      CHECK (payment_status IS NULL OR payment_status IN ('paid', 'pending')) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_expenses_source_attachment
  ON public.expenses (source_attachment_id)
  WHERE source_attachment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_document_number
  ON public.expenses (supplier_document, fiscal_document_number)
  WHERE supplier_document IS NOT NULL AND fiscal_document_number IS NOT NULL
    AND COALESCE(status, 'active') <> 'deleted';
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_fiscal_access_key
  ON public.expenses (fiscal_access_key)
  WHERE fiscal_access_key IS NOT NULL AND COALESCE(status, 'active') <> 'deleted';

UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp',
      'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
      'audio/ogg', 'audio/opus', 'audio/wav', 'audio/x-wav', 'audio/webm',
      'video/mp4', 'application/pdf'
    ]
WHERE id = 'ai-evidence';

CREATE OR REPLACE FUNCTION public.execute_pending_action_transactional_v4(
  p_action_id UUID,
  p_expected_source_message_id TEXT,
  p_steps JSONB,
  p_actor_profile_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_success BOOLEAN;
  v_error TEXT;
  v_source_message_id TEXT;
  v_step JSONB;
  v_payload JSONB;
  v_attachment_id UUID;
  v_expense_id UUID;
  v_amount NUMERIC;
  v_description TEXT;
  v_enriched_expense_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  BEGIN
    SELECT pending.source_message_id
    INTO v_source_message_id
    FROM public.pending_actions AS pending
    WHERE pending.id = p_action_id;

    SELECT result.success, result.error_message
    INTO v_success, v_error
    FROM public.execute_pending_action_transactional_v3(
      p_action_id,
      p_expected_source_message_id,
      p_steps,
      p_actor_profile_id,
      p_reason
    ) AS result;

    IF NOT COALESCE(v_success, false) THEN
      RETURN QUERY SELECT false, COALESCE(v_error, 'Não foi possível executar o plano.')::TEXT;
      RETURN;
    END IF;

    SELECT attachment.id
    INTO v_attachment_id
    FROM public.attachments AS attachment
    WHERE attachment.source_message_id = v_source_message_id
      AND attachment.media_kind = 'document'
      AND attachment.mime_type = 'application/pdf'
      AND COALESCE(attachment.status, 'active') <> 'deleted'
    ORDER BY attachment.created_at, attachment.id
    LIMIT 1;

    FOR v_step IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
      IF v_step->>'action_type' <> 'create_expense' THEN CONTINUE; END IF;
      v_payload := v_step->'payload';
      v_amount := NULLIF(v_payload->>'amount', '')::NUMERIC;
      v_description := NULLIF(btrim(v_payload->>'description'), '');

      SELECT expense.id
      INTO v_expense_id
      FROM public.expenses AS expense
      WHERE expense.source_message_id IS NOT DISTINCT FROM v_source_message_id
        AND expense.amount = v_amount
        AND expense.description = v_description
        AND NOT (expense.id = ANY(v_enriched_expense_ids))
        AND COALESCE(expense.status, 'active') <> 'deleted'
      ORDER BY expense.created_at DESC, expense.id DESC
      LIMIT 1;

      IF v_expense_id IS NULL THEN
        RAISE EXCEPTION 'Não foi possível vincular a despesa ao documento de origem.' USING ERRCODE = 'P0002';
      END IF;

      UPDATE public.expenses
      SET source_attachment_id = COALESCE(v_attachment_id, source_attachment_id),
          source_document_metadata = CASE
            WHEN COALESCE((v_payload->>'source_document')::BOOLEAN, false) THEN v_payload
            ELSE source_document_metadata
          END,
          fiscal_document_type = COALESCE(NULLIF(btrim(v_payload->>'fiscal_document_type'), ''), fiscal_document_type),
          fiscal_document_number = COALESCE(NULLIF(btrim(v_payload->>'fiscal_document_number'), ''), fiscal_document_number),
          fiscal_access_key = COALESCE(NULLIF(regexp_replace(v_payload->>'fiscal_access_key', '[^0-9]', '', 'g'), ''), fiscal_access_key),
          supplier_name = COALESCE(NULLIF(btrim(v_payload->>'supplier_name'), ''), supplier_name),
          supplier_document = COALESCE(NULLIF(btrim(v_payload->>'supplier_document'), ''), supplier_document),
          payment_method = COALESCE(NULLIF(btrim(v_payload->>'payment_method'), ''), payment_method),
          document_issue_date = COALESCE(NULLIF(v_payload->>'document_issue_date', '')::DATE, document_issue_date),
          payment_due_date = COALESCE(NULLIF(v_payload->>'payment_due_date', '')::DATE, payment_due_date),
          payment_status = COALESCE(NULLIF(v_payload->>'payment_status', ''), payment_status),
          has_receipt = COALESCE(has_receipt, false) OR v_attachment_id IS NOT NULL,
          updated_at = clock_timestamp()
      WHERE id = v_expense_id;

      v_enriched_expense_ids := array_append(v_enriched_expense_ids, v_expense_id);
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      v_error := left(SQLERRM, 1000);
      UPDATE public.pending_actions
      SET confirmation_status = 'failed', error_message = v_error,
          confirmed_by = NULL, confirmed_at = NULL, updated_at = clock_timestamp()
      WHERE id = p_action_id AND confirmation_status = 'pending';
      INSERT INTO public.audit_logs (
        table_name, record_id, action, before_data_json, after_data_json,
        changed_by, reason, source_message_id
      ) VALUES (
        'pending_actions', p_action_id, 'execute_document_plan_v4_failed',
        jsonb_build_object('confirmation_status', 'pending'),
        jsonb_build_object('confirmation_status', 'failed', 'error', v_error),
        p_actor_profile_id, v_error, v_source_message_id
      );
      RETURN QUERY SELECT false, v_error;
      RETURN;
  END;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_pending_action_transactional_v4(UUID, TEXT, JSONB, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_pending_action_transactional_v4(UUID, TEXT, JSONB, UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.execute_pending_action_transactional_v4(UUID, TEXT, JSONB, UUID, TEXT) IS
  'Executa o plano da Garça e vincula metadados fiscais e o PDF original à despesa na mesma transação.';

COMMIT;

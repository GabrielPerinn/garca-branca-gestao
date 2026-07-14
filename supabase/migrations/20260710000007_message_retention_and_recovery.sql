-- Add a recoverable inbox lease and privacy-preserving retention metadata.

BEGIN;

ALTER TABLE public.incoming_messages
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS redacted_at TIMESTAMP WITH TIME ZONE;

UPDATE public.incoming_messages
SET processing_started_at = COALESCE(processing_started_at, created_at),
    retention_expires_at = COALESCE(retention_expires_at, created_at + INTERVAL '90 days')
WHERE processing_started_at IS NULL
   OR retention_expires_at IS NULL;

ALTER TABLE public.incoming_messages
  ALTER COLUMN retention_expires_at SET DEFAULT (now() + INTERVAL '90 days');

ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS redacted_at TIMESTAMP WITH TIME ZONE;

-- Preserve one canonical domain result per provider message before enforcing
-- uniqueness. Older duplicates remain available but lose the ambiguous link.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY source_message_id
           ORDER BY created_at, id
         ) AS position
  FROM public.pending_actions
  WHERE source_message_id IS NOT NULL
)
UPDATE public.pending_actions AS pending
SET source_message_id = NULL
FROM ranked
WHERE pending.id = ranked.id
  AND ranked.position > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY source_message_id
           ORDER BY created_at, id
         ) AS position
  FROM public.occurrences
  WHERE source_message_id IS NOT NULL
)
UPDATE public.occurrences AS occurrence
SET source_message_id = NULL
FROM ranked
WHERE occurrence.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_actions_source_message
  ON public.pending_actions (source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_occurrences_source_message
  ON public.occurrences (source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incoming_messages_recovery
  ON public.incoming_messages (processing_status, processing_started_at)
  WHERE processing_status IN ('processing', 'error');

CREATE INDEX IF NOT EXISTS idx_incoming_messages_retention
  ON public.incoming_messages (retention_expires_at)
  WHERE redacted_at IS NULL;

-- Never duplicate WhatsApp text, phone numbers, payloads, or attachment URLs
-- into the audit trail. The operational row remains the sole retention target.
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action TEXT;
  v_before JSONB;
  v_after JSONB;
  v_record_id UUID;
  v_changed_by UUID;
  v_sensitive_fields TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSE
    RAISE EXCEPTION 'Operação de auditoria não suportada: %', TG_OP;
  END IF;

  IF TG_TABLE_NAME = 'incoming_messages' THEN
    v_sensitive_fields := ARRAY[
      'sender_phone', 'sender_user_id', 'text_content', 'raw_payload_json', 'media_id', 'media_url'
    ];
  ELSIF TG_TABLE_NAME = 'attachments' THEN
    v_sensitive_fields := ARRAY['file_url', 'storage_path'];
  ELSE
    v_sensitive_fields := ARRAY[]::TEXT[];
  END IF;

  v_before := CASE WHEN v_before IS NULL THEN NULL ELSE v_before - v_sensitive_fields END;
  v_after := CASE WHEN v_after IS NULL THEN NULL ELSE v_after - v_sensitive_fields END;

  SELECT profile.id
  INTO v_changed_by
  FROM public.users_profiles AS profile
  WHERE profile.user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.audit_logs (
    table_name, record_id, action, before_data_json, after_data_json, changed_by
  ) VALUES (
    TG_TABLE_NAME, v_record_id, v_action, v_before, v_after, v_changed_by
  );

  RETURN NEW;
END;
$$;

UPDATE public.audit_logs
SET before_data_json = CASE
      WHEN before_data_json IS NULL THEN NULL
      ELSE before_data_json - ARRAY['sender_phone', 'sender_user_id', 'text_content', 'raw_payload_json', 'media_id', 'media_url']::TEXT[]
    END,
    after_data_json = CASE
      WHEN after_data_json IS NULL THEN NULL
      ELSE after_data_json - ARRAY['sender_phone', 'sender_user_id', 'text_content', 'raw_payload_json', 'media_id', 'media_url']::TEXT[]
    END
WHERE table_name = 'incoming_messages';

UPDATE public.audit_logs
SET before_data_json = CASE
      WHEN before_data_json IS NULL THEN NULL
      ELSE before_data_json - ARRAY['file_url', 'storage_path']::TEXT[]
    END,
    after_data_json = CASE
      WHEN after_data_json IS NULL THEN NULL
      ELSE after_data_json - ARRAY['file_url', 'storage_path']::TEXT[]
    END
WHERE table_name = 'attachments';

CREATE OR REPLACE FUNCTION public.redact_expired_incoming_messages(
  p_limit INTEGER DEFAULT 500
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'Limite deve estar entre 1 e 5000.' USING ERRCODE = '22023';
  END IF;

  WITH targets AS (
    SELECT inbox.id
    FROM public.incoming_messages AS inbox
    WHERE inbox.redacted_at IS NULL
      AND inbox.retention_expires_at <= now()
      AND inbox.processing_status NOT IN ('pending', 'processing')
    ORDER BY inbox.retention_expires_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.incoming_messages AS inbox
  SET sender_phone = NULL,
      sender_user_id = NULL,
      text_content = NULL,
      raw_payload_json = NULL,
      media_id = NULL,
      media_url = NULL,
      status = 'redacted',
      redacted_at = now()
  FROM targets
  WHERE inbox.id = targets.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.redact_expired_incoming_messages(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redact_expired_incoming_messages(INTEGER) TO service_role;

COMMENT ON FUNCTION public.redact_expired_incoming_messages(INTEGER)
  IS 'Anonimiza conteúdo de mensagens concluídas após 90 dias; execute por job agendado.';

COMMIT;

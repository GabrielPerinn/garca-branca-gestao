-- Strategic farm intelligence, AI observability and private media evidence.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_strategic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID REFERENCES public.farms(id) ON DELETE SET NULL,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  previous_window_start DATE NOT NULL,
  previous_window_end DATE NOT NULL,
  generation_mode TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'completed',
  executive_summary TEXT NOT NULL,
  maturity_score INTEGER NOT NULL,
  maturity_label TEXT NOT NULL,
  snapshot_json JSONB NOT NULL,
  limitations_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  model_name TEXT,
  prompt_version INTEGER NOT NULL DEFAULT 1,
  processing_ms INTEGER,
  created_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.ai_strategic_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.ai_strategic_reports(id) ON DELETE CASCADE,
  farm_id UUID REFERENCES public.farms(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  finding TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  estimated_impact TEXT,
  evidence_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  confidence TEXT NOT NULL,
  horizon TEXT NOT NULL,
  action_title TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  pending_action_id UUID REFERENCES public.pending_actions(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  model_name TEXT,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  error_category TEXT,
  user_profile_id UUID REFERENCES public.users_profiles(id) ON DELETE SET NULL,
  source_message_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS incoming_message_id UUID REFERENCES public.incoming_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pending_action_id UUID REFERENCES public.pending_actions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_media_id TEXT,
  ADD COLUMN IF NOT EXISTS media_kind TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS transcription TEXT,
  ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_strategic_report_dates_valid') THEN
    ALTER TABLE public.ai_strategic_reports ADD CONSTRAINT ai_strategic_report_dates_valid
      CHECK (window_start <= window_end AND previous_window_start <= previous_window_end) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_strategic_report_score_valid') THEN
    ALTER TABLE public.ai_strategic_reports ADD CONSTRAINT ai_strategic_report_score_valid
      CHECK (maturity_score BETWEEN 0 AND 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_strategic_report_mode_valid') THEN
    ALTER TABLE public.ai_strategic_reports ADD CONSTRAINT ai_strategic_report_mode_valid
      CHECK (generation_mode IN ('manual', 'scheduled')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_strategic_insight_category_valid') THEN
    ALTER TABLE public.ai_strategic_insights ADD CONSTRAINT ai_strategic_insight_category_valid
      CHECK (category IN ('finance', 'livestock', 'productivity', 'operations', 'inventory', 'people', 'compliance', 'data_quality')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_strategic_insight_priority_valid') THEN
    ALTER TABLE public.ai_strategic_insights ADD CONSTRAINT ai_strategic_insight_priority_valid
      CHECK (priority IN ('critical', 'high', 'medium', 'opportunity')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_strategic_insight_confidence_valid') THEN
    ALTER TABLE public.ai_strategic_insights ADD CONSTRAINT ai_strategic_insight_confidence_valid
      CHECK (confidence IN ('high', 'medium', 'low')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_strategic_insight_horizon_valid') THEN
    ALTER TABLE public.ai_strategic_insights ADD CONSTRAINT ai_strategic_insight_horizon_valid
      CHECK (horizon IN ('immediate', '30_days', '90_days', 'long_term')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_strategic_insight_status_valid') THEN
    ALTER TABLE public.ai_strategic_insights ADD CONSTRAINT ai_strategic_insight_status_valid
      CHECK (status IN ('open', 'converted', 'dismissed', 'completed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_status_valid') THEN
    ALTER TABLE public.ai_usage_events ADD CONSTRAINT ai_usage_status_valid
      CHECK (status IN ('success', 'error', 'fallback')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_media_kind_valid') THEN
    ALTER TABLE public.attachments ADD CONSTRAINT attachments_media_kind_valid
      CHECK (media_kind IS NULL OR media_kind IN ('audio', 'image', 'document')) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ai_strategic_reports_farm_created
  ON public.ai_strategic_reports (farm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_strategic_insights_report_priority
  ON public.ai_strategic_insights (report_id, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_strategic_insights_status
  ON public.ai_strategic_insights (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created
  ON public.ai_usage_events (created_at DESC, operation, status);
CREATE INDEX IF NOT EXISTS idx_attachments_incoming_message
  ON public.attachments (incoming_message_id) WHERE incoming_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_pending_action
  ON public.attachments (pending_action_id) WHERE pending_action_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_attachments_provider_media
  ON public.attachments (provider_media_id) WHERE provider_media_id IS NOT NULL AND status <> 'deleted';

ALTER TABLE public.ai_strategic_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_strategic_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read strategic reports" ON public.ai_strategic_reports;
CREATE POLICY "Authenticated users can read strategic reports"
  ON public.ai_strategic_reports FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can read strategic insights" ON public.ai_strategic_insights;
CREATE POLICY "Authenticated users can read strategic insights"
  ON public.ai_strategic_insights FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.ai_strategic_reports, public.ai_strategic_insights, public.ai_usage_events FROM anon;
GRANT SELECT ON public.ai_strategic_reports, public.ai_strategic_insights TO authenticated;
GRANT ALL ON public.ai_strategic_reports, public.ai_strategic_insights, public.ai_usage_events TO service_role;

DROP TRIGGER IF EXISTS set_updated_at_ai_strategic_reports ON public.ai_strategic_reports;
CREATE TRIGGER set_updated_at_ai_strategic_reports BEFORE UPDATE ON public.ai_strategic_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_ai_strategic_insights ON public.ai_strategic_insights;
CREATE TRIGGER set_updated_at_ai_strategic_insights BEFORE UPDATE ON public.ai_strategic_insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS audit_ai_strategic_reports ON public.ai_strategic_reports;
CREATE TRIGGER audit_ai_strategic_reports AFTER INSERT OR UPDATE ON public.ai_strategic_reports
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
DROP TRIGGER IF EXISTS audit_ai_strategic_insights ON public.ai_strategic_insights;
CREATE TRIGGER audit_ai_strategic_insights AFTER INSERT OR UPDATE ON public.ai_strategic_insights
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-evidence',
  'ai-evidence',
  false,
  26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/x-wav', 'audio/webm', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.maintain_ai_evidence_retention(p_limit INTEGER DEFAULT 200)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 2000 THEN
    RAISE EXCEPTION 'Limite deve estar entre 1 e 2000.' USING ERRCODE = '22023';
  END IF;

  WITH targets AS (
    SELECT attachment.id, attachment.storage_path
    FROM public.attachments AS attachment
    WHERE attachment.redacted_at IS NULL
      AND attachment.legal_hold = false
      AND attachment.retention_expires_at IS NOT NULL
      AND attachment.retention_expires_at <= clock_timestamp()
      AND attachment.status NOT IN ('deleted', 'redacted')
    ORDER BY attachment.retention_expires_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), removed_objects AS (
    DELETE FROM storage.objects AS object
    USING targets
    WHERE object.bucket_id = 'ai-evidence'
      AND object.name = targets.storage_path
    RETURNING object.name
  )
  UPDATE public.attachments AS attachment
  SET file_url = '', storage_path = NULL, transcription = NULL,
      status = 'redacted', redacted_at = clock_timestamp(), updated_at = clock_timestamp()
  FROM targets
  WHERE attachment.id = targets.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.maintain_ai_evidence_retention(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintain_ai_evidence_retention(INTEGER) TO service_role;

COMMIT;

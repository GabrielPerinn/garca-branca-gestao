-- Keep the WhatsApp inbox aligned with the canonical schema introduced in
-- 20260624000000_initial_schema.sql. The CREATE is intentionally idempotent so
-- this migration is also safe in environments where the initial table exists.
CREATE TABLE IF NOT EXISTS public.incoming_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_message_id TEXT UNIQUE NOT NULL,
  provider TEXT,
  sender_phone TEXT,
  sender_user_id UUID REFERENCES public.users_profiles(id),
  message_type TEXT,
  raw_payload_json JSONB,
  text_content TEXT,
  media_id TEXT,
  media_url TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.incoming_messages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.incoming_messages IS
  'Mensagens recebidas de provedores externos antes e depois do processamento pela IA.';

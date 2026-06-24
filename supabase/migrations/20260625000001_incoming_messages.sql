-- Migration: WhatsApp incoming messages table + audit_logs improvements
-- Run this on Supabase SQL editor

-- Table for raw incoming messages from WhatsApp
CREATE TABLE IF NOT EXISTS incoming_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'whatsapp', -- 'whatsapp', 'manual', 'api'
  sender_phone TEXT,
  message_id TEXT UNIQUE, -- WhatsApp message ID (idempotency)
  raw_text TEXT NOT NULL,
  image_url TEXT,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'processed', 'error'
  ai_reply TEXT,
  error_message TEXT,
  pending_action_id UUID REFERENCES pending_actions(id),
  occurrence_id UUID REFERENCES occurrences(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_incoming_messages_sender ON incoming_messages(sender_phone);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_status ON incoming_messages(status);

-- RLS: only service_role can read/write
ALTER TABLE incoming_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only_incoming" ON incoming_messages
  USING (false) WITH CHECK (false);

-- Allow audit_logs insert to not require all columns
ALTER TABLE audit_logs ALTER COLUMN action_type DROP NOT NULL;

COMMENT ON TABLE incoming_messages IS 'Raw messages received from WhatsApp webhook, before AI processing';

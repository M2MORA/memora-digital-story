-- MEMORA - Ballech, the WhatsApp agent (V1): conversations, messages, WhatsApp orders.
--
-- The webhook writes with the service role (bypasses RLS). Admins read and
-- update through the admin app; nobody else can read these tables.
--
-- This file is ASCII only on purpose, to avoid encoding damage when pasted.

BEGIN;

-- 1. Conversations: one per customer WhatsApp number
CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone TEXT UNIQUE NOT NULL,
  customer_name TEXT,
  mode TEXT NOT NULL DEFAULT 'bot' CHECK (mode IN ('bot', 'human')),
  handoff_reason TEXT,
  handoff_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_conversations_last_message
  ON public.wa_conversations(last_message_at DESC);

-- 2. Orders: where the order came from, and the conversation behind it
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS wa_conversation_id UUID
    REFERENCES public.wa_conversations(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_source_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_source_check CHECK (source IN ('web', 'whatsapp'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_wa_conversation
  ON public.orders(wa_conversation_id) WHERE wa_conversation_id IS NOT NULL;

-- 3. Messages: every inbound and outbound message, media path in payload
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  -- Meta message id: unique, so a webhook retry is stored only once
  wa_message_id TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  author TEXT NOT NULL CHECK (author IN ('customer', 'bot', 'admin')),
  type TEXT NOT NULL DEFAULT 'text'
    CHECK (type IN ('text', 'image', 'video', 'audio', 'document', 'other')),
  body TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation
  ON public.wa_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_order
  ON public.wa_messages(order_id) WHERE order_id IS NOT NULL;

-- 4. RLS: admins only (app_metadata, never user_metadata)
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read wa conversations" ON public.wa_conversations;
CREATE POLICY "Admins read wa conversations"
ON public.wa_conversations FOR SELECT TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins update wa conversations" ON public.wa_conversations;
CREATE POLICY "Admins update wa conversations"
ON public.wa_conversations FOR UPDATE TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins read wa messages" ON public.wa_messages;
CREATE POLICY "Admins read wa messages"
ON public.wa_messages FOR SELECT TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admin replies go through the server (/api/admin/whatsapp/send), which writes
-- with the service role: no INSERT policy for clients.

COMMIT;

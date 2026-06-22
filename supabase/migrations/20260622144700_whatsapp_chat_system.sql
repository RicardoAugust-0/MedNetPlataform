-- Migration: WhatsApp Live Chat System and Messaging Logs
-- Target: Supabase database

-- 1. Table for WhatsApp Chat Sessions
CREATE TABLE IF NOT EXISTS public.whatsapp_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_chats ENABLE ROW LEVEL SECURITY;

-- Policies for whatsapp_chats
CREATE POLICY "authenticated_all_whatsapp_chats" ON public.whatsapp_chats
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Table for WhatsApp Messages
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  meta_message_id TEXT UNIQUE,
  error_message TEXT,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Policies for whatsapp_messages
CREATE POLICY "authenticated_all_whatsapp_messages" ON public.whatsapp_messages
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Indexes for Performance
CREATE INDEX IF NOT EXISTS whatsapp_chats_last_msg_idx ON public.whatsapp_chats (last_message_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_messages_chat_id_idx ON public.whatsapp_messages (chat_id);
CREATE INDEX IF NOT EXISTS whatsapp_messages_meta_id_idx ON public.whatsapp_messages (meta_message_id);

-- 4. Enable Supabase Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_chats;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;

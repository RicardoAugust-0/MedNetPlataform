-- 1. Criar tabela de tópicos (threads) para o chat da IA
CREATE TABLE IF NOT EXISTS public.ai_chat_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'Nova conversa',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS para ai_chat_threads
ALTER TABLE public.ai_chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_chat_threads" ON public.ai_chat_threads
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 2. Modificar ai_chat_messages para associar com uma thread
ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.ai_chat_threads(id) ON DELETE CASCADE;

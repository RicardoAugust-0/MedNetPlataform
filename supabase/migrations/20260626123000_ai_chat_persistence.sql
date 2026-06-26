-- 1. Tabela para persistência de mensagens do chat da IA
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  text        text NOT NULL,
  chart       jsonb, -- Armazena a estrutura do gráfico se houver
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS para ai_chat_messages
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_chat_messages" ON public.ai_chat_messages
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

-- 2. Tabela para persistência de relatórios e arquivos gerados pela IA
CREATE TABLE IF NOT EXISTS public.ai_generated_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  content       text NOT NULL, -- Relatório em Markdown
  chart_payload jsonb, -- Gráfico Recharts opcional associado
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS para ai_generated_reports
ALTER TABLE public.ai_generated_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_generated_reports" ON public.ai_generated_reports
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

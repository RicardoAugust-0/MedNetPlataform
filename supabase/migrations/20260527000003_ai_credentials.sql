-- Credenciais de provedores de IA para geração de relatórios.
-- Mesmo padrão de rpa_credentials: admin escreve via browser, edge function lê via service_role.

CREATE TABLE ai_credentials (
  provider    text        PRIMARY KEY,   -- 'anthropic' | 'google'
  api_key     text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE ai_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_ai_credentials" ON ai_credentials
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

-- Configuração pública: qual provedor/modelo usar por padrão (sem dados sensíveis).
INSERT INTO app_settings (key, value)
VALUES (
  'ai_config',
  '{
    "provider": "anthropic",
    "anthropic_model": "claude-sonnet-4-6",
    "google_model": "gemini-2.5-flash"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

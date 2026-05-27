-- RF01: Infraestrutura de Automação RPA
--
-- 1. Remove tabelas órfãs da automação anterior (Edge Functions já deletadas)
-- 2. Cria tabela rpa_credentials (credenciais do robô, lidas só pela VPS via service_role)
-- 3. Semeia chave rpa_config em app_settings

-- ── 1. Limpeza das tabelas órfãs ────────────────────────────────────────────
DROP TABLE IF EXISTS maxtrack_cache;
DROP TABLE IF EXISTS maxtrack_sessions;

-- ── 2. Credenciais do robô ───────────────────────────────────────────────────
-- Cada linha é uma conta dedicada por plataforma (maxtrack, sascar, …).
-- INSERT/UPDATE/DELETE: admin autenticado.
-- SELECT: admin autenticado (email visível na UI, senha apenas texto cifrado na VPS).
-- A VPS lê com service_role (bypassa RLS) via SUPABASE_SERVICE_KEY em .env.

CREATE TABLE rpa_credentials (
  platform_id  text        PRIMARY KEY,                              -- 'maxtrack' | 'sascar' | …
  email        text        NOT NULL,
  password     text        NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE rpa_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_rpa_credentials" ON rpa_credentials
  FOR ALL TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 3. Configuração do robô em app_settings ─────────────────────────────────
-- Campos lidos/escritos pela UI (admin):  enabled, interval_minutes
-- Campos escritos pela VPS (service_role): last_run_at, last_run_status, last_run_message
-- Campos informativos:                     platforms (lista das plataformas gerenciadas)

INSERT INTO app_settings (key, value)
VALUES (
  'rpa_config',
  '{
    "enabled": false,
    "interval_minutes": 30,
    "platforms": ["maxtrack"],
    "last_run_at": null,
    "last_run_status": null,
    "last_run_message": null
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

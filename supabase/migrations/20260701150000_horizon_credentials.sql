-- Migration: 20260701150000_horizon_credentials.sql
-- Trilha A (ingestão Horizon): tabela de credenciais das contas Horizon,
-- com rotação de senha (senha atual + candidatas conhecidas) e status de
-- login para a UI de admin sinalizar contas com problema.
-- Trilha C1 (sincronização de tratamento): automação Bot_HorizonTreatment,
-- disparada quando um atendimento MaxTrack é registrado no MedNet.

CREATE TABLE IF NOT EXISTS public.horizon_credentials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label               text NOT NULL,
  email               text NOT NULL UNIQUE,
  password            text NOT NULL,
  password_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status              text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'credential_error', 'session_expired')),
  last_login_at       timestamptz,
  last_error          text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.horizon_credentials ENABLE ROW LEVEL SECURITY;

-- CRUD completo restrito a admin — a rota Express usa o client de serviço
-- (SUPABASE_SERVICE_ROLE_KEY), que ignora RLS, então o robô na VPS não
-- depende desta policy.
DROP POLICY IF EXISTS "admin_all_horizon_credentials" ON public.horizon_credentials;
CREATE POLICY "admin_all_horizon_credentials"
  ON public.horizon_credentials FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Bot_HorizonTreatment: quando um atendimento MaxTrack é registrado no
-- MedNet (useAtendimentos.registrar), dispara este endpoint para que a VPS
-- replique o tratamento também na Horizon (espelho da mesma frota/eventos).
INSERT INTO public.automations (id, name, icon, description, active, endpoint, trigger, schedule, event_type, token, position)
VALUES (
  'f0a94e82-e3e7-4c74-bfd4-3a56df93df27',
  'Bot_HorizonTreatment',
  'ti-robot',
  'Replica na Horizon o tratamento de um alerta já resolvido na MaxTrack.',
  true,
  'https://botsplaywright.duckdns.org/automacoes/bot_HorizonTreatment',
  'evento',
  null,
  'Atendimento registrado (MaxTrack)',
  null,
  2
)
ON CONFLICT (id) DO NOTHING;

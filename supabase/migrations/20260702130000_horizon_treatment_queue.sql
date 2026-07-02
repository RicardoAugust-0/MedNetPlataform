-- Migration: 20260702130000_horizon_treatment_queue.sql
-- Trilha B (Auto Cross-Check + B3): fila de pendências geradas pelo
-- cross-check automático entre driver_events(platform_id='maxtrack') e
-- driver_events(platform_id='horizon'). Cada linha é um evento MaxTrack já
-- classificado (Positivo ou Falso positivo) que precisa ter o mesmo
-- veredito replicado na Horizon. O Bot_HorizonTreatment (B3, robô na VPS)
-- consome essa fila filtrando status = 'pending'.

CREATE TABLE IF NOT EXISTS public.horizon_treatment_queue (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Evento de origem (sempre platform_id = 'maxtrack' em driver_events)
  driver_event_id         uuid NOT NULL REFERENCES public.driver_events(id) ON DELETE CASCADE,
  placa                   text NOT NULL,
  nome                    text,
  ocorrido_em             timestamptz NOT NULL,
  classificacao           text NOT NULL, -- 'Positivo' | 'Falso positivo' (driver_events.analise_ia_plataforma)
  motivo_raw              text,          -- driver_events.descricao (tags cruas da coluna "Motivo" da MaxTrack)

  -- Sugestão de mapeamento pro campo "Intervenção" da Horizon (ver
  -- PLANO_AUTOMACAO_HORIZON.md, seção B3, tabela confirmada em 2026-07-02)
  intervencao_sugerida    text NOT NULL,

  -- Par encontrado em driver_events(platform_id='horizon'), se houver
  horizon_driver_event_id uuid REFERENCES public.driver_events(id) ON DELETE SET NULL,

  status                  text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'already_synced', 'no_horizon_match', 'done', 'error')),
  tentativas               integer NOT NULL DEFAULT 0,
  erro                    text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (driver_event_id)
);

CREATE INDEX IF NOT EXISTS horizon_treatment_queue_status_idx
  ON public.horizon_treatment_queue (status, ocorrido_em DESC);

ALTER TABLE public.horizon_treatment_queue ENABLE ROW LEVEL SECURITY;

-- Leitura pra qualquer autenticado (futura tela de acompanhamento);
-- escrita só pelo backend Express via service_role (bypassa RLS).
DROP POLICY IF EXISTS "authenticated_read_horizon_treatment_queue" ON public.horizon_treatment_queue;
CREATE POLICY "authenticated_read_horizon_treatment_queue"
  ON public.horizon_treatment_queue FOR SELECT
  USING (auth.uid() IS NOT NULL);

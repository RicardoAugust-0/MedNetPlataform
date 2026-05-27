-- Histórico permanente de eventos brutos de telemetria.
--
-- Cada linha representa um alerta individual capturado pelo RPA (ou upload manual).
-- A chave única (platform_id, placa, ocorrido_em, nome_evento) garante idempotência:
-- o writer da VPS pode usar INSERT … ON CONFLICT DO NOTHING sem checar duplicatas.
--
-- Hot tier: mantém os últimos 12 meses em produção.
-- Cold tier: job mensal na VPS arquiva eventos > 12 meses em Supabase Storage
--            como JSONL comprimido (event-archives/{ano}/{mes}.jsonl.gz).

CREATE TABLE driver_events (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Origem
  platform_id           text        NOT NULL,  -- 'maxtrack' | 'sascar' | …

  -- Identificação do motorista/veículo
  placa                 text        NOT NULL,
  nome                  text,
  cpf                   text,
  matricula             text,
  transportadora        text,
  frota                 text,

  -- Evento
  nome_evento           text        NOT NULL,   -- 'Detecção olhos fechados ou falta de atenção - N1'
  descricao             text,                   -- 'Desatenção / Fadiga'
  categoria_bucket      text,                   -- 'intervencao' | 'reportar' | 'tecnico'
  severidade            text,                   -- 'Gravíssimo' | 'Grave' | 'Normal'
  turno                 text,                   -- 'diurno' | 'noturno'

  -- Contexto do evento
  localidade            text,
  velocidade_kmh        numeric,
  duracao_seg           numeric,
  analise_ia_plataforma text,                   -- análise da própria Maxtrack ('Concluído - Positivo' etc.)
  raw_event_type_id     text,                   -- 'Id do Evento' da plataforma (código de tipo, não instância)

  -- Timestamps
  ocorrido_em           timestamptz NOT NULL,   -- quando o alerta aconteceu na estrada
  importado_em          timestamptz DEFAULT now(),

  -- Deduplicação: INSERT … ON CONFLICT DO NOTHING no writer da VPS
  UNIQUE (platform_id, placa, ocorrido_em, nome_evento)
);

-- Índices para queries de relatório
CREATE INDEX driver_events_placa_ts    ON driver_events (placa,          ocorrido_em DESC);
CREATE INDEX driver_events_transp_ts   ON driver_events (transportadora, ocorrido_em DESC);
CREATE INDEX driver_events_platform_ts ON driver_events (platform_id,    ocorrido_em DESC);
CREATE INDEX driver_events_bucket_ts   ON driver_events (categoria_bucket, ocorrido_em DESC);

-- RLS: operadores autenticados leem (painel Relatórios).
-- Inserções apenas via service_role (VPS) — service_role bypassa RLS por padrão no Supabase.
ALTER TABLE driver_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read driver_events"
  ON driver_events FOR SELECT
  USING (auth.uid() IS NOT NULL);

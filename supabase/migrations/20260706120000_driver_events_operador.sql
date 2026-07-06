-- Fase 4B — captura do operador que fechou o alerta (só MaxTrack por enquanto).
-- Base para ranking/contagem por operador (sem cálculo de remuneração ainda).
-- Coluna nova, opcional (outras plataformas não têm essa informação na planilha).

alter table public.driver_events add column if not exists operador text;

create index if not exists driver_events_operador_idx
  on public.driver_events (platform_id, operador)
  where operador is not null;

-- Aceleração do import: índice funcional por plataforma e dia.
--
-- O trigger statement-level `trg_analytics_daily_ins` reconstrói o rollup
-- para os dias afetados rodando a função `refresh_analytics_daily`.
-- Essa função filtra por platform_id e dia via:
--   (e.ocorrido_em at time zone 'America/Sao_Paulo')::date = any (p_dias)
-- Sem este índice funcional, o Postgres é forçado a fazer um scan sequencial
-- na plataforma inteira (~277k+ registros), fazendo com que até mesmo
-- mini-lotes (como batch size de 25) gerem timeout.
--
-- Com o índice abaixo, o Postgres pode buscar diretamente os registros
-- dos dias afetados em milissegundos.

CREATE INDEX IF NOT EXISTS driver_events_platform_dia_active
  ON driver_events (platform_id, ((ocorrido_em at time zone 'America/Sao_Paulo')::date))
  WHERE severidade IS DISTINCT FROM 'Leve' AND sev_norm <> 'Leve';

ANALYZE driver_events;

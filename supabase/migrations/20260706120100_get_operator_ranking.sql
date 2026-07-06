-- Fase 4B — ranking de operadores (só ranking/contagem, sem R$ por enquanto).
-- Consulta direta em driver_events (não passa pelo rollup analytics_daily):
-- o volume de linhas com `operador` preenchido é pequeno o bastante (só
-- MaxTrack, campo novo) para uma live query com o índice parcial já criado
-- em driver_events_operador_idx (ver 20260706120000_driver_events_operador.sql).

create or replace function get_operator_ranking(
  p_platform_id text,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_severity text default null
)
returns table (
  operador text,
  total_eventos bigint,
  gravissimo bigint,
  grave bigint,
  medio bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.operador,
    count(*) as total_eventos,
    count(*) filter (where e.sev_norm = 'Gravíssimo') as gravissimo,
    count(*) filter (where e.sev_norm = 'Grave')       as grave,
    count(*) filter (where e.sev_norm = 'Médio')        as medio
  from driver_events e
  where e.platform_id = p_platform_id
    and e.operador is not null
    and e.sev_norm <> 'Leve'
    and (p_date_from is null or e.ocorrido_em >= p_date_from)
    and (p_date_to   is null or e.ocorrido_em <= p_date_to)
    and (
      p_severity is null or p_severity = 'all'
      or (p_severity = 'high'   and e.sev_norm in ('Grave', 'Gravíssimo'))
      or (p_severity = 'medium' and e.sev_norm = 'Médio')
      or e.sev_norm = p_severity
    )
  group by e.operador
  order by total_eventos desc;
$$;

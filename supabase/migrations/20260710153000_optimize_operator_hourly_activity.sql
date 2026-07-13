-- Faz o ranking horário usar a data real de fechamento e mantém a consulta
-- indexável em bancos que já executaram a migração original da atividade.

create index if not exists driver_events_operator_closed_activity_idx
  on public.driver_events (platform_id, (coalesce(fim_tratativa, ocorrido_em)) desc, operador)
  where operador is not null and operador <> '' and sev_norm <> 'Leve';

create or replace function get_operator_event_activity(
  p_platform_id text,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_severity text default null,
  p_tz text default 'America/Sao_Paulo'
)
returns table (
  operador text,
  total_eventos bigint,
  gravissimo bigint,
  grave bigint,
  medio bigint,
  hourly jsonb,
  active_slots jsonb,
  active_hours bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as materialized (
    select
      e.operador,
      e.sev_norm,
      (coalesce(e.fim_tratativa, e.ocorrido_em) at time zone p_tz) as activity_ts
    from public.driver_events e
    where e.platform_id = p_platform_id
      and e.operador is not null
      and e.operador <> ''
      and e.sev_norm <> 'Leve'
      and (p_date_from is null or coalesce(e.fim_tratativa, e.ocorrido_em) >= p_date_from)
      and (p_date_to is null or coalesce(e.fim_tratativa, e.ocorrido_em) <= p_date_to)
      and (
        p_severity is null or p_severity = '' or p_severity = 'all'
        or (p_severity = 'high' and e.sev_norm in ('Grave', 'Gravissimo', 'Gravíssimo'))
        or (p_severity = 'medium' and e.sev_norm in ('Medio', 'Médio'))
        or e.sev_norm = p_severity
      )
  ),
  grouped as (
    select
      operador,
      count(*) as total_eventos,
      count(*) filter (where sev_norm in ('Gravissimo', 'Gravíssimo')) as gravissimo,
      count(*) filter (where sev_norm = 'Grave') as grave,
      count(*) filter (where sev_norm in ('Medio', 'Médio')) as medio,
      jsonb_agg(distinct to_char(activity_ts, 'YYYY-MM-DD HH24')) as active_slots,
      count(distinct to_char(activity_ts, 'YYYY-MM-DD HH24')) as active_hours
    from filtered
    group by operador
  ),
  hourly_counts as (
    select operador, extract(hour from activity_ts)::int as hour, count(*) as c
    from filtered
    group by operador, extract(hour from activity_ts)::int
  )
  select
    g.operador,
    g.total_eventos,
    g.gravissimo,
    g.grave,
    g.medio,
    (
      select jsonb_agg(coalesce(h.c, 0) order by gs.hour)
      from generate_series(0, 23) as gs(hour)
      left join hourly_counts h on h.operador = g.operador and h.hour = gs.hour
    ) as hourly,
    g.active_slots,
    g.active_hours
  from grouped g
  order by g.total_eventos desc;
$$;

revoke execute on function get_operator_event_activity(text, timestamptz, timestamptz, text, text) from anon;
grant execute on function get_operator_event_activity(text, timestamptz, timestamptz, text, text) to authenticated;

analyze public.driver_events;

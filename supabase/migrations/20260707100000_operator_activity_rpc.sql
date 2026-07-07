-- Otimizacao do ranking de operadores.
--
-- A rota /api/analytics/operator-ranking nao deve baixar milhares de eventos
-- para agregar no Node. Estas RPCs devolvem apenas linhas ja agregadas por
-- operador, preservando o shape atual da API e removendo o limite de 5000 linhas.

create index if not exists driver_events_operator_activity_idx
  on public.driver_events (platform_id, ocorrido_em desc, operador)
  where operador is not null and sev_norm <> 'Leve';

create index if not exists intervencoes_sheet_operator_activity_idx
  on public.intervencoes_sheet (lower(sistema), created_at desc, realizado_por)
  where realizado_por is not null and realizado_por <> '';

-- Consultas interativas do DossiePage:
-- driver_events por nome quando nao ha placa e atendimentos por motorista.
create index if not exists driver_events_nome_ts
  on public.driver_events (nome, ocorrido_em desc)
  where nome is not null;

create index if not exists atendimentos_motorista_created_at_idx
  on public.atendimentos (motorista, created_at desc);

create index if not exists driver_events_ocorrido_em_idx
  on public.driver_events (ocorrido_em desc);

create index if not exists atendimentos_created_placa_idx
  on public.atendimentos (created_at desc, placa);

-- Conversas e mensagens: as rotas carregam as ultimas mensagens de um chat.
create index if not exists whatsapp_messages_chat_created_at_idx
  on public.whatsapp_messages (chat_id, created_at desc);

-- AI chat: listas por usuario, historico por thread e galeria de relatorios.
create index if not exists ai_chat_threads_user_updated_at_idx
  on public.ai_chat_threads (user_id, updated_at desc);

create index if not exists ai_chat_messages_user_thread_created_at_idx
  on public.ai_chat_messages (user_id, thread_id, created_at desc);

create index if not exists ai_generated_reports_created_at_idx
  on public.ai_generated_reports (created_at desc);

-- Historicos administrativos carregam os registros recentes por data.
create index if not exists automation_logs_automation_created_at_idx
  on public.automation_logs (automation_id, created_at desc);

create index if not exists whatsapp_dispatches_status_created_at_idx
  on public.whatsapp_dispatches (status, created_at desc);

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
      and (p_date_from is null or e.ocorrido_em >= p_date_from)
      and (p_date_to is null or e.ocorrido_em <= p_date_to)
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

create or replace function get_operator_sheet_activity(
  p_platform_id text,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_tz text default 'America/Sao_Paulo'
)
returns table (
  realizado_por text,
  intervencoes bigint,
  hourly_interventions jsonb,
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
      i.realizado_por,
      (i.created_at at time zone p_tz) as activity_ts
    from public.intervencoes_sheet i
    where lower(i.sistema) = lower(p_platform_id)
      and i.realizado_por is not null
      and i.realizado_por <> ''
      and (p_date_from is null or i.created_at >= p_date_from)
      and (p_date_to is null or i.created_at <= p_date_to)
  ),
  grouped as (
    select
      realizado_por,
      count(*) as intervencoes,
      jsonb_agg(distinct to_char(activity_ts, 'YYYY-MM-DD HH24')) as active_slots,
      count(distinct to_char(activity_ts, 'YYYY-MM-DD HH24')) as active_hours
    from filtered
    group by realizado_por
  ),
  hourly_counts as (
    select realizado_por, extract(hour from activity_ts)::int as hour, count(*) as c
    from filtered
    group by realizado_por, extract(hour from activity_ts)::int
  )
  select
    g.realizado_por,
    g.intervencoes,
    (
      select jsonb_agg(coalesce(h.c, 0) order by gs.hour)
      from generate_series(0, 23) as gs(hour)
      left join hourly_counts h on h.realizado_por = g.realizado_por and h.hour = gs.hour
    ) as hourly_interventions,
    g.active_slots,
    g.active_hours
  from grouped g
  order by g.intervencoes desc;
$$;

revoke execute on function get_operator_sheet_activity(text, timestamptz, timestamptz, text) from anon;
grant execute on function get_operator_sheet_activity(text, timestamptz, timestamptz, text) to authenticated;

analyze public.driver_events;
analyze public.intervencoes_sheet;

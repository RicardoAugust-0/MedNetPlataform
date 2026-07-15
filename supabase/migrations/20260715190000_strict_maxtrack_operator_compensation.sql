-- Torna a atividade de operadores MaxTrack estrita para uso financeiro.
-- Uma linha só conta quando a origem informou tanto o operador quanto a data
-- real de finalização. `ocorrido_em` nunca pode substituir `fim_tratativa`.

create index if not exists driver_events_operator_strict_closed_activity_idx
  on public.driver_events (platform_id, fim_tratativa desc, operador)
  where operador is not null
    and btrim(operador) <> ''
    and fim_tratativa is not null
    and sev_norm <> 'Leve';

create or replace function public.get_operator_event_activity(
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
      (e.fim_tratativa at time zone p_tz) as activity_ts
    from public.driver_events e
    where e.platform_id = p_platform_id
      and e.operador is not null
      and btrim(e.operador) <> ''
      and e.fim_tratativa is not null
      and e.sev_norm <> 'Leve'
      and (p_date_from is null or e.fim_tratativa >= p_date_from)
      and (p_date_to is null or e.fim_tratativa <= p_date_to)
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

revoke execute on function public.get_operator_event_activity(text, timestamptz, timestamptz, text, text) from anon;
grant execute on function public.get_operator_event_activity(text, timestamptz, timestamptz, text, text) to authenticated;

-- Mantém a RPC legada sob a mesma regra estrita para evitar que um consumidor
-- futuro produza totais financeiros diferentes da rota atual.
create or replace function public.get_operator_ranking(
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
    count(*) filter (where e.sev_norm in ('Gravissimo', 'Gravíssimo')) as gravissimo,
    count(*) filter (where e.sev_norm = 'Grave') as grave,
    count(*) filter (where e.sev_norm in ('Medio', 'Médio')) as medio
  from public.driver_events e
  where e.platform_id = p_platform_id
    and e.operador is not null
    and btrim(e.operador) <> ''
    and e.fim_tratativa is not null
    and e.sev_norm <> 'Leve'
    and (p_date_from is null or e.fim_tratativa >= p_date_from)
    and (p_date_to is null or e.fim_tratativa <= p_date_to)
    and (
      p_severity is null or p_severity = '' or p_severity = 'all'
      or (p_severity = 'high' and e.sev_norm in ('Grave', 'Gravissimo', 'Gravíssimo'))
      or (p_severity = 'medium' and e.sev_norm in ('Medio', 'Médio'))
      or e.sev_norm = p_severity
    )
  group by e.operador
  order by total_eventos desc;
$$;

revoke execute on function public.get_operator_ranking(text, timestamptz, timestamptz, text) from anon;
grant execute on function public.get_operator_ranking(text, timestamptz, timestamptz, text) to authenticated;

-- Sobrecarga usada pelo ingest novo. A assinatura antiga de um argumento
-- continua disponível para integrações legadas, mas sem autoridade para apagar
-- campos que o layout antigo não conhece.
create or replace function public.upsert_driver_events_preserve(
  p_rows jsonb,
  p_authoritative_operator boolean,
  p_authoritative_treatment_end boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  insert into public.driver_events (
    platform_id,
    placa,
    nome,
    cpf,
    matricula,
    transportadora,
    frota,
    nome_evento,
    descricao,
    categoria_bucket,
    severidade,
    turno,
    localidade,
    velocidade_kmh,
    duracao_seg,
    analise_ia_plataforma,
    raw_event_type_id,
    ocorrido_em,
    evidencia,
    inicio_tratativa,
    fim_tratativa,
    operador
  )
  select
    platform_id,
    placa,
    nome,
    cpf,
    matricula,
    transportadora,
    frota,
    nome_evento,
    descricao,
    categoria_bucket,
    severidade,
    turno,
    localidade,
    velocidade_kmh,
    duracao_seg,
    analise_ia_plataforma,
    raw_event_type_id,
    ocorrido_em,
    evidencia,
    inicio_tratativa,
    fim_tratativa,
    nullif(btrim(operador), '')
  from jsonb_to_recordset(p_rows) as r(
    platform_id text,
    placa text,
    nome text,
    cpf text,
    matricula text,
    transportadora text,
    frota text,
    nome_evento text,
    descricao text,
    categoria_bucket text,
    severidade text,
    turno text,
    localidade text,
    velocidade_kmh numeric,
    duracao_seg numeric,
    analise_ia_plataforma text,
    raw_event_type_id text,
    ocorrido_em timestamptz,
    evidencia text,
    inicio_tratativa timestamptz,
    fim_tratativa timestamptz,
    operador text
  )
  on conflict (platform_id, placa, ocorrido_em, nome_evento) do update set
    nome = coalesce(excluded.nome, driver_events.nome),
    cpf = coalesce(excluded.cpf, driver_events.cpf),
    matricula = coalesce(excluded.matricula, driver_events.matricula),
    transportadora = coalesce(excluded.transportadora, driver_events.transportadora),
    frota = coalesce(excluded.frota, driver_events.frota),
    descricao = coalesce(excluded.descricao, driver_events.descricao),
    categoria_bucket = coalesce(excluded.categoria_bucket, driver_events.categoria_bucket),
    severidade = coalesce(excluded.severidade, driver_events.severidade),
    turno = coalesce(excluded.turno, driver_events.turno),
    localidade = coalesce(excluded.localidade, driver_events.localidade),
    velocidade_kmh = coalesce(excluded.velocidade_kmh, driver_events.velocidade_kmh),
    duracao_seg = coalesce(excluded.duracao_seg, driver_events.duracao_seg),
    analise_ia_plataforma = coalesce(excluded.analise_ia_plataforma, driver_events.analise_ia_plataforma),
    raw_event_type_id = coalesce(excluded.raw_event_type_id, driver_events.raw_event_type_id),
    evidencia = coalesce(excluded.evidencia, driver_events.evidencia),
    inicio_tratativa = coalesce(excluded.inicio_tratativa, driver_events.inicio_tratativa),
    fim_tratativa = case
      when p_authoritative_treatment_end then excluded.fim_tratativa
      else coalesce(excluded.fim_tratativa, driver_events.fim_tratativa)
    end,
    operador = case
      when p_authoritative_operator then excluded.operador
      else coalesce(excluded.operador, driver_events.operador)
    end;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.upsert_driver_events_preserve(jsonb, boolean, boolean) from anon;
grant execute on function public.upsert_driver_events_preserve(jsonb, boolean, boolean) to authenticated;
grant execute on function public.upsert_driver_events_preserve(jsonb, boolean, boolean) to service_role;

comment on function public.get_operator_event_activity(text, timestamptz, timestamptz, text, text) is
  'Atividade estrita para remuneração: exige operador e fim_tratativa, sem fallback para ocorrido_em.';

analyze public.driver_events;

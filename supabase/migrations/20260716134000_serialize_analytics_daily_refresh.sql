-- Serializa a reconstrucao do rollup por plataforma.
--
-- Os imports Horizon/ALP chegam em paralelo. Cada upsert em driver_events
-- dispara refresh_analytics_daily, que apaga e reinsere o mesmo conjunto de
-- chaves do dia. Sem coordenacao, duas transacoes podem tentar recriar a mesma
-- PK de analytics_daily ao mesmo tempo.

create or replace function public.refresh_analytics_daily(
  p_platform text,
  p_dias date[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- O lock dura ate o fim da transacao que alterou driver_events. Imports de
  -- plataformas diferentes continuam concorrentes; somente refreshes do mesmo
  -- rollup sao serializados. Em READ COMMITTED, os comandos seguintes passam a
  -- enxergar a transacao que acabou de liberar o lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'analytics_daily:' || coalesce(p_platform, '<null>'),
      0
    )
  );

  if p_dias is null then
    delete from public.analytics_daily
    where platform_id = p_platform;
  else
    delete from public.analytics_daily
    where platform_id = p_platform
      and dia = any (p_dias);
  end if;

  insert into public.analytics_daily (
    platform_id,
    dia,
    fleet_raw,
    sev_norm,
    clf_norm,
    nome_evento,
    cnt,
    uf_counts,
    hora_counts,
    vel_counts,
    desc_counts,
    driver_counts,
    plate_counts
  )
  with ev as materialized (
    select
      e.platform_id,
      (e.ocorrido_em at time zone 'America/Sao_Paulo')::date as dia,
      e.fleet_raw,
      e.sev_norm,
      e.clf_norm,
      e.nome_evento,
      e.uf,
      extract(
        hour from (e.ocorrido_em at time zone 'America/Sao_Paulo')
      )::integer as hh,
      case
        when e.velocidade_kmh is not null
          and e.velocidade_kmh >= 0
          and e.velocidade_kmh < 200
          then e.velocidade_kmh::integer
      end as vh,
      nullif(trim(e.descricao), '') as dsc,
      nullif(trim(e.nome), '') as drv,
      nullif(trim(e.placa), '') as plt
    from public.driver_events e
    where e.platform_id = p_platform
      and e.severidade is distinct from 'Leve'
      and e.sev_norm <> 'Leve'
      and (
        p_dias is null
        or (e.ocorrido_em at time zone 'America/Sao_Paulo')::date = any (p_dias)
      )
  ),
  g as (
    select
      platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento,
      count(*) as cnt
    from ev
    group by 1, 2, 3, 4, 5, 6
  ),
  uf as (
    select
      platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento,
      jsonb_object_agg(uf, c) as j
    from (
      select
        platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, uf,
        count(*) as c
      from ev
      where uf is not null
      group by 1, 2, 3, 4, 5, 6, 7
    ) x
    group by 1, 2, 3, 4, 5, 6
  ),
  ho as (
    select
      platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento,
      jsonb_object_agg(hh::text, c) as j
    from (
      select
        platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, hh,
        count(*) as c
      from ev
      group by 1, 2, 3, 4, 5, 6, 7
    ) x
    group by 1, 2, 3, 4, 5, 6
  ),
  ve as (
    select
      platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento,
      jsonb_object_agg(vh::text, c) as j
    from (
      select
        platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, vh,
        count(*) as c
      from ev
      where vh is not null
      group by 1, 2, 3, 4, 5, 6, 7
    ) x
    group by 1, 2, 3, 4, 5, 6
  ),
  ds as (
    select
      platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento,
      jsonb_object_agg(dsc, c) as j
    from (
      select
        platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, dsc,
        count(*) as c
      from ev
      where dsc is not null
      group by 1, 2, 3, 4, 5, 6, 7
    ) x
    group by 1, 2, 3, 4, 5, 6
  ),
  dr as (
    select
      platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento,
      jsonb_object_agg(drv, c) as j
    from (
      select
        platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, drv,
        count(*) as c
      from ev
      where drv is not null
      group by 1, 2, 3, 4, 5, 6, 7
    ) x
    group by 1, 2, 3, 4, 5, 6
  ),
  pl as (
    select
      platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento,
      jsonb_object_agg(plt, c) as j
    from (
      select
        platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, plt,
        count(*) as c
      from ev
      where plt is not null
      group by 1, 2, 3, 4, 5, 6, 7
    ) x
    group by 1, 2, 3, 4, 5, 6
  )
  select
    g.platform_id,
    g.dia,
    g.fleet_raw,
    g.sev_norm,
    g.clf_norm,
    g.nome_evento,
    g.cnt,
    coalesce(uf.j, '{}'::jsonb),
    coalesce(ho.j, '{}'::jsonb),
    coalesce(ve.j, '{}'::jsonb),
    coalesce(ds.j, '{}'::jsonb),
    coalesce(dr.j, '{}'::jsonb),
    coalesce(pl.j, '{}'::jsonb)
  from g
  left join uf using (
    platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento
  )
  left join ho using (
    platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento
  )
  left join ve using (
    platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento
  )
  left join ds using (
    platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento
  )
  left join dr using (
    platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento
  )
  left join pl using (
    platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento
  );
end;
$$;

comment on function public.refresh_analytics_daily(text, date[]) is
  'Reconstroi o rollup diario e serializa refreshes concorrentes por plataforma.';

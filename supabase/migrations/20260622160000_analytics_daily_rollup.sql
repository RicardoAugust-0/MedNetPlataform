-- Aceleração do Analytics — Fase 7: rollup diário pré-agregado.
--
-- Diagnóstico: get_analytics varre driver_events (~277k linhas) ~15 vezes por
-- carga. Mesmo otimizada (colunas geradas + passe único) isso é caro numa
-- instância Micro (CPU estrangulada). Solução estrutural: pré-agregar por dia
-- num grão minúsculo e fazer o dashboard ler o rollup em vez dos dados crus.
--
-- Cardinalidades medidas (maxtrack, 277k linhas): fleet_raw=2, nome_evento=4,
-- sev_norm<=4, clf_norm=3, uf=23, descricao=1; só motorista (1395) e placa (1061)
-- são altos. O grão (platform, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
-- tem 5.334 linhas (52x menos). Motorista/placa cabem como mapas jsonb por linha.
--
-- Tudo (exceto cnt) é jsonb {chave: contagem}, ADITIVO: mesclar várias linhas do
-- grão = somar os mapas. Velocidade é inteira (0..199) => histograma reproduz a
-- mediana exata. dow é derivado de `dia`. hora_pos (positivos) é derivado porque
-- clf_norm está no grão.

create table if not exists analytics_daily (
  platform_id   text  not null,
  dia           date  not null,
  fleet_raw     text  not null,
  sev_norm      text  not null,
  clf_norm      text  not null,
  nome_evento   text  not null,
  cnt           integer not null,
  uf_counts     jsonb not null default '{}'::jsonb,  -- {uf: c}            (uf não nulo)
  hora_counts   jsonb not null default '{}'::jsonb,  -- {'0'..'23': c}
  vel_counts    jsonb not null default '{}'::jsonb,  -- {'0'..'199': c}    (vel válida)
  desc_counts   jsonb not null default '{}'::jsonb,  -- {descricao_trim: c}
  driver_counts jsonb not null default '{}'::jsonb,  -- {nome_trim: c}     (não vazio)
  plate_counts  jsonb not null default '{}'::jsonb,  -- {placa_trim: c}    (não vazio)
  primary key (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
);

create index if not exists analytics_daily_platform_dia
  on analytics_daily (platform_id, dia);

alter table analytics_daily enable row level security;
create policy "authenticated read analytics_daily"
  on analytics_daily for select using (auth.uid() is not null);

-- ── Refresh (recompute) do rollup para um platform + conjunto de dias ──
-- p_dias null  => recomputa a plataforma inteira (rebuild).
-- p_dias array => recomputa só esses dias (incremental, barato).
create or replace function refresh_analytics_daily(p_platform text, p_dias date[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_dias is null then
    delete from analytics_daily where platform_id = p_platform;
  else
    delete from analytics_daily where platform_id = p_platform and dia = any (p_dias);
  end if;

  insert into analytics_daily (
    platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, cnt,
    uf_counts, hora_counts, vel_counts, desc_counts, driver_counts, plate_counts)
  with ev as materialized (
    select e.platform_id,
      (e.ocorrido_em at time zone 'America/Sao_Paulo')::date as dia,
      e.fleet_raw, e.sev_norm, e.clf_norm, e.nome_evento, e.uf,
      extract(hour from (e.ocorrido_em at time zone 'America/Sao_Paulo'))::int as hh,
      case when e.velocidade_kmh is not null and e.velocidade_kmh >= 0 and e.velocidade_kmh < 200
           then e.velocidade_kmh::int end as vh,
      nullif(trim(e.descricao), '') as dsc,
      nullif(trim(e.nome), '')      as drv,
      nullif(trim(e.placa), '')     as plt
    from driver_events e
    where e.platform_id = p_platform
      and e.severidade is distinct from 'Leve'
      and e.sev_norm <> 'Leve'
      and (p_dias is null
           or (e.ocorrido_em at time zone 'America/Sao_Paulo')::date = any (p_dias))
  ),
  g as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, count(*) cnt
    from ev group by 1,2,3,4,5,6),
  uf as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(uf, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, uf, count(*) c
          from ev where uf is not null group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6),
  ho as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(hh::text, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, hh, count(*) c
          from ev group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6),
  ve as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(vh::text, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, vh, count(*) c
          from ev where vh is not null group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6),
  ds as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(dsc, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, dsc, count(*) c
          from ev where dsc is not null group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6),
  dr as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(drv, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, drv, count(*) c
          from ev where drv is not null group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6),
  pl as (
    select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, jsonb_object_agg(plt, c) j
    from (select platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento, plt, count(*) c
          from ev where plt is not null group by 1,2,3,4,5,6,7) x
    group by 1,2,3,4,5,6)
  select g.platform_id, g.dia, g.fleet_raw, g.sev_norm, g.clf_norm, g.nome_evento, g.cnt,
    coalesce(uf.j, '{}'::jsonb), coalesce(ho.j, '{}'::jsonb), coalesce(ve.j, '{}'::jsonb),
    coalesce(ds.j, '{}'::jsonb), coalesce(dr.j, '{}'::jsonb), coalesce(pl.j, '{}'::jsonb)
  from g
  left join uf using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
  left join ho using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
  left join ve using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
  left join ds using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
  left join dr using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento)
  left join pl using (platform_id, dia, fleet_raw, sev_norm, clf_norm, nome_evento);
end;
$$;

-- ── Trigger de manutenção: mantém o rollup consistente com driver_events ──
-- Statement-level com transition tables: por import (em lote), recomputa só os
-- dias afetados. Cobre TODOS os caminhos de escrita (RPA/VPS, import manual,
-- edge functions), pois é no banco.
create or replace function trg_analytics_daily_ins() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select platform_id, array_agg(distinct dia) dias from (
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from new_rows
    ) s group by platform_id
  loop perform refresh_analytics_daily(r.platform_id, r.dias); end loop;
  return null;
end; $$;

create or replace function trg_analytics_daily_del() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select platform_id, array_agg(distinct dia) dias from (
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from old_rows
    ) s group by platform_id
  loop perform refresh_analytics_daily(r.platform_id, r.dias); end loop;
  return null;
end; $$;

create or replace function trg_analytics_daily_upd() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select platform_id, array_agg(distinct dia) dias from (
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from new_rows
      union
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia from old_rows
    ) s group by platform_id
  loop perform refresh_analytics_daily(r.platform_id, r.dias); end loop;
  return null;
end; $$;

drop trigger if exists analytics_daily_ins on driver_events;
drop trigger if exists analytics_daily_del on driver_events;
drop trigger if exists analytics_daily_upd on driver_events;

create trigger analytics_daily_ins after insert on driver_events
  referencing new table as new_rows for each statement
  execute function trg_analytics_daily_ins();
create trigger analytics_daily_del after delete on driver_events
  referencing old table as old_rows for each statement
  execute function trg_analytics_daily_del();
create trigger analytics_daily_upd after update on driver_events
  referencing old table as old_rows new table as new_rows for each statement
  execute function trg_analytics_daily_upd();

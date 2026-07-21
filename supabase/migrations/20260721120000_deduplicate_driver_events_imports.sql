-- Corrige importacoes antigas repetidas e torna o reenvio do mesmo arquivo
-- idempotente. A identidade do evento e a mesma usada pelo upsert do Analytics.
--
-- Entre copias do mesmo evento, preserva-se primeiro a mais completa e, em caso
-- de empate, a mais recente. Assim uma reimportacao posterior que trouxe dados
-- de tratativa nao e descartada em favor de uma linha parcial.
create temporary table driver_event_duplicate_map on commit drop as
with ranked_duplicates as (
  select
    id,
    first_value(id) over (
      partition by platform_id, placa, ocorrido_em, nome_evento
      order by
        (fim_tratativa is not null) desc,
        (operador is not null and btrim(operador) <> '') desc,
        (evidencia is not null and btrim(evidencia) <> '') desc,
        (inicio_tratativa is not null) desc,
        importado_em desc nulls last,
        id desc
    ) as retained_id
  from public.driver_events
)
select id as duplicate_id, retained_id
from ranked_duplicates
where id <> retained_id;

-- As filas Horizon possuem referencias aos eventos brutos. Antes de remover
-- copias, consolida referencias de origem iguais (mesmo match_key), mantendo
-- o estado mais relevante, e aponta a linha sobrevivente para o evento retido.
with queue_source_candidates as (
  select
    q.id,
    map.retained_id,
    q.match_key,
    q.status,
    q.updated_at
  from public.horizon_treatment_queue q
  join driver_event_duplicate_map map on map.duplicate_id = q.driver_event_id
  union all
  select
    q.id,
    map.retained_id,
    q.match_key,
    q.status,
    q.updated_at
  from public.horizon_treatment_queue q
  join (select distinct retained_id from driver_event_duplicate_map) map
    on map.retained_id = q.driver_event_id
), ranked_queue_sources as (
  select
    id,
    row_number() over (
      partition by retained_id, match_key
      order by
        case status
          when 'done' then 0
          when 'error' then 1
          when 'already_synced' then 2
          else 3
        end,
        updated_at desc,
        id desc
    ) as queue_rank
  from queue_source_candidates
), duplicate_queue_sources as (
  select id from ranked_queue_sources where queue_rank > 1
)
delete from public.horizon_treatment_queue q
using duplicate_queue_sources duplicates
where q.id = duplicates.id;

update public.horizon_treatment_queue q
set driver_event_id = map.retained_id,
    updated_at = now()
from driver_event_duplicate_map map
where q.driver_event_id = map.duplicate_id;

-- Um alvo Horizon so pode ter uma tratativa. Ao fundir copias desse alvo,
-- conserva a fila em estado mais avancado e redireciona a referencia restante.
with queue_target_candidates as (
  select
    q.id,
    map.retained_id,
    q.status,
    q.updated_at
  from public.horizon_treatment_queue q
  join driver_event_duplicate_map map on map.duplicate_id = q.horizon_driver_event_id
  union all
  select
    q.id,
    map.retained_id,
    q.status,
    q.updated_at
  from public.horizon_treatment_queue q
  join (select distinct retained_id from driver_event_duplicate_map) map
    on map.retained_id = q.horizon_driver_event_id
), ranked_queue_targets as (
  select
    id,
    row_number() over (
      partition by retained_id
      order by
        case status
          when 'done' then 0
          when 'error' then 1
          when 'already_synced' then 2
          else 3
        end,
        updated_at desc,
        id desc
    ) as queue_rank
  from queue_target_candidates
), duplicate_queue_targets as (
  select id from ranked_queue_targets where queue_rank > 1
)
delete from public.horizon_treatment_queue q
using duplicate_queue_targets duplicates
where q.id = duplicates.id;

update public.horizon_treatment_queue q
set horizon_driver_event_id = map.retained_id,
    match_key = map.retained_id::text,
    updated_at = now()
from driver_event_duplicate_map map
where q.horizon_driver_event_id = map.duplicate_id;

delete from public.driver_events events
using driver_event_duplicate_map duplicates
where events.id = duplicates.duplicate_id;

-- A base mais antiga pode nao ter recebido a constraint original. O indice com
-- o mesmo nome da constraint criada na migration inicial nao duplica estruturas
-- em bancos atualizados e tambem e elegivel para ON CONFLICT (...).
create unique index if not exists driver_events_platform_id_placa_ocorrido_em_nome_evento_key
  on public.driver_events (platform_id, placa, ocorrido_em, nome_evento);

comment on index public.driver_events_platform_id_placa_ocorrido_em_nome_evento_key is
  'Impede que a mesma importacao Analytics conte um evento mais de uma vez.';

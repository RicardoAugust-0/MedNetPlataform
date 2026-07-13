-- Corrige a fila para que cada alerta Horizon seja um alvo operacional unico.
-- A migracao e idempotente e preserva primeiro tratativas terminais; entre
-- vinculos nao terminais, mantem o evento MaxTrack mais proximo no tempo.

-- Alertas que ja aparecem tratados no ultimo relatorio Horizon nao devem ser
-- procurados novamente na grade de alertas abertos.
update public.horizon_treatment_queue q
set status = 'already_synced',
    erro = null,
    updated_at = now()
from public.driver_events h
where h.id = q.horizon_driver_event_id
  and q.status = 'pending'
  and nullif(trim(h.analise_ia_plataforma), '') is not null
  and h.analise_ia_plataforma <> 'Não classificado';

-- Remove placeholders antigos quando o mesmo evento MaxTrack ja possui um
-- correspondente Horizon concreto.
delete from public.horizon_treatment_queue unmatched
where unmatched.match_key = 'unmatched'
  and exists (
    select 1
    from public.horizon_treatment_queue matched
    where matched.driver_event_id = unmatched.driver_event_id
      and matched.horizon_driver_event_id is not null
  );

-- O algoritmo anterior permitia N eventos MaxTrack apontando para o mesmo
-- alerta Horizon. Mantem uma unica linha: done/error primeiro para preservar
-- auditoria; caso contrario, o pareamento temporalmente mais proximo.
with ranked as (
  select
    q.id,
    row_number() over (
      partition by q.horizon_driver_event_id
      order by
        case q.status
          when 'done' then 0
          when 'error' then 1
          when 'already_synced' then 2
          else 3
        end,
        abs(extract(epoch from (q.ocorrido_em - h.ocorrido_em))),
        q.created_at,
        q.id
    ) as target_rank
  from public.horizon_treatment_queue q
  join public.driver_events h on h.id = q.horizon_driver_event_id
  where q.horizon_driver_event_id is not null
), duplicates as (
  select id
  from ranked
  where target_rank > 1
)
delete from public.horizon_treatment_queue q
using duplicates d
where q.id = d.id;

-- PostgreSQL permite varios NULLs em um indice unique; portanto placeholders
-- sem correspondencia continuam validos, enquanto um alvo Horizon concreto
-- nao pode voltar a ser enfileirado por outro evento MaxTrack.
drop index if exists public.horizon_treatment_queue_horizon_event_idx;

create unique index if not exists horizon_treatment_queue_unique_horizon_event_idx
  on public.horizon_treatment_queue (horizon_driver_event_id);

comment on index public.horizon_treatment_queue_unique_horizon_event_idx is
  'Garante uma unica tratativa por evento Horizon; NULL e reservado a no_horizon_match.';

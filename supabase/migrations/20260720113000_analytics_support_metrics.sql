-- Calcula os indicadores de evidencia e tratativa sem transferir driver_events
-- para o backend. p_sources segue o contrato de get_analytics_rollup_multi:
-- [{"platform_id":"maxtrack","frotas":["..."]|null}, ...]. Fontes que se
-- sobrepoem formam uma uniao e nunca duplicam o mesmo evento.

create or replace function public.analytics_support_metrics(
  p_sources jsonb,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_severity text default null,
  p_classification text default null,
  p_event_type text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with base as (
    select
      e.ocorrido_em,
      e.evidencia,
      e.inicio_tratativa,
      e.fim_tratativa
    from public.driver_events e
    where exists (
      select 1
      from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) source
      where e.platform_id = source->>'platform_id'
        and (
          source->'frotas' is null
          or jsonb_typeof(source->'frotas') = 'null'
          or e.fleet_raw in (
            select jsonb_array_elements_text(source->'frotas')
          )
        )
    )
      and e.sev_norm <> 'Leve'
      and (p_date_from is null or e.ocorrido_em >= p_date_from)
      and (p_date_to is null or e.ocorrido_em <= p_date_to)
      and (
        p_classification is null
        or p_classification = ''
        or p_classification = 'all'
        or e.clf_norm = p_classification
      )
      and (
        p_event_type is null
        or p_event_type = ''
        or e.nome_evento = p_event_type
      )
      and (
        p_severity is null
        or p_severity = ''
        or p_severity = 'all'
        or (p_severity = 'high' and e.sev_norm in ('Grave', 'Gravíssimo'))
        or (p_severity = 'medium' and e.sev_norm = 'Médio')
        or (
          p_severity not in ('high', 'medium', 'all', '')
          and e.sev_norm = p_severity
        )
      )
  )
  select jsonb_build_object(
    'evidence_total', count(*) filter (
      where evidencia is not null and evidencia <> ''
    ),
    'evidence_available', count(*) filter (
      where public.analytics_has_evid(evidencia)
    ),
    't_ini_mediana', round((
      percentile_cont(0.5) within group (
        order by extract(epoch from (inicio_tratativa - ocorrido_em)) / 60.0
      ) filter (
        where ocorrido_em is not null
          and inicio_tratativa is not null
          and inicio_tratativa >= ocorrido_em
          and inicio_tratativa - ocorrido_em < interval '24 hours'
      )
    )::numeric, 1)::double precision,
    't_fin_mediana', round((
      percentile_cont(0.5) within group (
        order by extract(epoch from (fim_tratativa - ocorrido_em)) / 60.0
      ) filter (
        where ocorrido_em is not null
          and fim_tratativa is not null
          and fim_tratativa >= ocorrido_em
          and fim_tratativa - ocorrido_em < interval '72 hours'
      )
    )::numeric, 1)::double precision
  )
  from base;
$$;

revoke all on function public.analytics_support_metrics(
  jsonb,
  timestamptz,
  timestamptz,
  text,
  text,
  text
) from public, anon;

grant execute on function public.analytics_support_metrics(
  jsonb,
  timestamptz,
  timestamptz,
  text,
  text,
  text
) to authenticated, service_role;

comment on function public.analytics_support_metrics(
  jsonb,
  timestamptz,
  timestamptz,
  text,
  text,
  text
) is 'Retorna evidencia e medianas de tratativa em um unico scan de driver_events.';

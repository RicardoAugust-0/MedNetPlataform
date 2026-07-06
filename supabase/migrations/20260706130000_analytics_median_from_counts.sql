'-- Reconstrução de analytics_median_from_counts — usada por get_analytics_rollup
-- e get_analytics_rollup_multi (vel_mediana) mas cuja definição nunca chegou a
-- ser gravada em nenhuma migration deste repo (só o uso ficou registrado) —
-- por isso falta tanto aqui quanto em qualquer banco que reaplique as
-- migrations do zero. Reproduz round(percentile_cont(0.5) within group (order
-- by v))::int a partir de um histograma jsonb {valor_texto: contagem}.
--
-- Fórmula: rank 0-indexado rn = 0.5*(N-1); interpola entre os valores nas
-- posições floor(rn) e ceil(rn) da lista expandida (ponderada pelas contagens).
-- N ímpar => rn inteiro => valor exato do meio. N par => média dos dois do
-- meio. Validado manualmente contra os casos ímpar/par/com pesos.

create or replace function analytics_median_from_counts(counts jsonb)
returns int
language sql
immutable
as $$
  with buckets as (
    select (key)::numeric as v, (value)::bigint as c
    from jsonb_each_text(coalesce(counts, '{}'::jsonb))
    where (value)::bigint > 0
  ),
  n as (
    select coalesce(sum(c), 0)::numeric as total from buckets
  ),
  cum as (
    select v, c,
           sum(c) over (order by v) as cum_upto,
           sum(c) over (order by v) - c as cum_before
    from buckets
  ),
  target as (
    select case when total <= 1 then 0::numeric else 0.5 * (total - 1) end as rn
    from n
  ),
  lo as (
    select v from cum, target where target.rn >= cum.cum_before and target.rn < cum.cum_upto limit 1
  ),
  hi as (
    select v from cum, target where ceil(target.rn) >= cum.cum_before and ceil(target.rn) < cum.cum_upto limit 1
  )
  select case when (select total from n) = 0 then null
    else round((select v from lo) + (select rn - floor(rn) from target) * ((select v from hi) - (select v from lo)))::int
  end;
$$;
'
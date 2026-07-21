-- A exclusao de uma plataforma e feita em varios lotes pela RPC abaixo.
-- Nao reconstrua analytics_daily a cada lote: ao terminar, o rollup inteiro da
-- plataforma tambem deixa de existir e pode ser removido diretamente.

create or replace function public.trg_analytics_daily_del()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if current_setting('mednet.defer_analytics_daily_refresh', true) = 'on' then
    return null;
  end if;

  for r in
    select platform_id, array_agg(distinct dia) dias
    from (
      select platform_id, (ocorrido_em at time zone 'America/Sao_Paulo')::date dia
      from old_rows
    ) affected
    group by platform_id
  loop
    perform public.refresh_analytics_daily(r.platform_id, r.dias);
  end loop;
  return null;
end;
$$;

create or replace function public.delete_driver_events_platform_batch(
  p_platform_id text,
  p_batch_size integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer := 0;
  v_batch_size integer := least(greatest(coalesce(p_batch_size, 100), 1), 100);
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem excluir dados de plataforma'
      using errcode = '42501';
  end if;

  -- O gatilho de DELETE le esta configuracao e nao tenta recalcular o rollup
  -- para cada lote. A configuracao e local a esta transacao/RPC.
  perform set_config('mednet.defer_analytics_daily_refresh', 'on', true);

  with batch as (
    select e.id
    from public.driver_events e
    where e.platform_id = p_platform_id
    limit v_batch_size
    for update
  )
  delete from public.driver_events e
  using batch
  where e.id = batch.id;

  get diagnostics v_deleted = row_count;

  if not exists (
    select 1
    from public.driver_events e
    where e.platform_id = p_platform_id
  ) then
    delete from public.analytics_daily d
    where d.platform_id = p_platform_id;
  end if;

  return v_deleted;
end;
$$;

revoke execute on function public.delete_driver_events_platform_batch(text, integer) from public, anon;
grant execute on function public.delete_driver_events_platform_batch(text, integer) to authenticated;

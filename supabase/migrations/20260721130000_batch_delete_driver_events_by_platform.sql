-- Exclui uma plataforma de Analytics em lotes curtos.
--
-- A exclusao anterior usava um unico DELETE por platform_id. Em plataformas
-- grandes, os cascades da fila Horizon fazem a instrucao ultrapassar o
-- statement_timeout do Supabase. Cada chamada desta RPC e uma transacao curta;
-- o cliente a repete ate que ela retorne zero.

create index if not exists driver_events_platform_id_idx
  on public.driver_events (platform_id);

create or replace function public.delete_driver_events_platform_batch(
  p_platform_id text,
  p_batch_size integer default 250
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer := 0;
  v_batch_size integer := least(greatest(coalesce(p_batch_size, 250), 1), 250);
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem excluir dados de plataforma'
      using errcode = '42501';
  end if;

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
  return v_deleted;
end;
$$;

revoke execute on function public.delete_driver_events_platform_batch(text, integer) from public, anon;
grant execute on function public.delete_driver_events_platform_batch(text, integer) to authenticated;

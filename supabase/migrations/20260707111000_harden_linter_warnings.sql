-- Fix Supabase linter warnings:
-- 1) functions must pin search_path;
-- 2) write policies should avoid literal true predicates.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'analytics_norm',
        'analytics_norm_crit',
        'analytics_norm_clf',
        'analytics_to_uf',
        'rls_auto_enable',
        'drivers_queue_touch_updated_at',
        'touch_intervencoes_sheet_updated_at',
        'trigger_espelhamento_sheets_fn',
        'analytics_has_evid',
        'aggregate_driver_events',
        'analytics_median_from_counts'
      )
  loop
    execute format('alter function %s set search_path = public', fn.signature);
  end loop;
end;
$$;

-- driver_documents
drop policy if exists "authenticated_insert_driver_documents" on public.driver_documents;
create policy "authenticated_insert_driver_documents" on public.driver_documents
  for insert to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "authenticated_update_driver_documents" on public.driver_documents;
create policy "authenticated_update_driver_documents" on public.driver_documents
  for update to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "authenticated_delete_driver_documents" on public.driver_documents;
create policy "authenticated_delete_driver_documents" on public.driver_documents
  for delete to authenticated
  using ((select auth.uid()) is not null);

-- driver_events
drop policy if exists "authenticated insert driver_events" on public.driver_events;
create policy "authenticated insert driver_events"
  on public.driver_events for insert to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "authenticated delete driver_events" on public.driver_events;
create policy "authenticated delete driver_events"
  on public.driver_events for delete to authenticated
  using ((select auth.uid()) is not null);

-- driver_health
drop policy if exists "authenticated_insert_driver_health" on public.driver_health;
create policy "authenticated_insert_driver_health" on public.driver_health
  for insert to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "authenticated_update_driver_health" on public.driver_health;
create policy "authenticated_update_driver_health" on public.driver_health
  for update to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

drop policy if exists "authenticated_delete_driver_health" on public.driver_health;
create policy "authenticated_delete_driver_health" on public.driver_health
  for delete to authenticated
  using ((select auth.uid()) is not null);

-- drivers_queue is deprecated in newer migrations, but some live databases still have it.
do $$
begin
  if to_regclass('public.drivers_queue') is not null then
    drop policy if exists "drivers_queue_insert" on public.drivers_queue;
    create policy "drivers_queue_insert" on public.drivers_queue
      for insert to authenticated
      with check ((select auth.uid()) is not null);

    drop policy if exists "drivers_queue_update" on public.drivers_queue;
    create policy "drivers_queue_update" on public.drivers_queue
      for update to authenticated
      using ((select auth.uid()) is not null)
      with check ((select auth.uid()) is not null);

    drop policy if exists "drivers_queue_delete" on public.drivers_queue;
    create policy "drivers_queue_delete" on public.drivers_queue
      for delete to authenticated
      using ((select auth.uid()) is not null);
  end if;
end;
$$;

-- intervencoes_sheet
drop policy if exists "Operadores inserem intervencoes_sheet" on public.intervencoes_sheet;
create policy "Operadores inserem intervencoes_sheet" on public.intervencoes_sheet
  for insert to authenticated
  with check ((select auth.uid()) is not null);

drop policy if exists "Operadores atualizam intervencoes_sheet" on public.intervencoes_sheet;
create policy "Operadores atualizam intervencoes_sheet" on public.intervencoes_sheet
  for update to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- whatsapp_chats
drop policy if exists "authenticated_all_whatsapp_chats" on public.whatsapp_chats;
create policy "authenticated_all_whatsapp_chats" on public.whatsapp_chats
  for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- whatsapp_dispatches
drop policy if exists "authenticated_insert_whatsapp_dispatches" on public.whatsapp_dispatches;
create policy "authenticated_insert_whatsapp_dispatches" on public.whatsapp_dispatches
  for insert to authenticated
  with check ((select auth.uid()) is not null);

-- whatsapp_messages
drop policy if exists "authenticated_all_whatsapp_messages" on public.whatsapp_messages;
create policy "authenticated_all_whatsapp_messages" on public.whatsapp_messages
  for all to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

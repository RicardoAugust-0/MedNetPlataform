-- Endurece prontuarios e documentos de motoristas.
-- Leitura operacional continua autenticada; mutacoes exigem lider/admin ou
-- service_role (que ignora RLS). Toda alteracao de metadados fica auditada.

drop policy if exists "authenticated_select_driver_health"
  on public.driver_health;
drop policy if exists "authenticated_insert_driver_health"
  on public.driver_health;
drop policy if exists "authenticated_update_driver_health"
  on public.driver_health;
drop policy if exists "authenticated_delete_driver_health"
  on public.driver_health;
drop policy if exists "authenticated_read_driver_health"
  on public.driver_health;
drop policy if exists "privileged_insert_driver_health"
  on public.driver_health;
drop policy if exists "privileged_update_driver_health"
  on public.driver_health;
drop policy if exists "privileged_delete_driver_health"
  on public.driver_health;

create policy "authenticated_read_driver_health"
  on public.driver_health for select to authenticated
  using ((select auth.uid()) is not null);

create policy "privileged_insert_driver_health"
  on public.driver_health for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

create policy "privileged_update_driver_health"
  on public.driver_health for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

create policy "privileged_delete_driver_health"
  on public.driver_health for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

drop policy if exists "authenticated_select_driver_documents"
  on public.driver_documents;
drop policy if exists "authenticated_insert_driver_documents"
  on public.driver_documents;
drop policy if exists "authenticated_update_driver_documents"
  on public.driver_documents;
drop policy if exists "authenticated_delete_driver_documents"
  on public.driver_documents;
drop policy if exists "authenticated_read_driver_documents"
  on public.driver_documents;
drop policy if exists "privileged_insert_driver_documents"
  on public.driver_documents;
drop policy if exists "privileged_update_driver_documents"
  on public.driver_documents;
drop policy if exists "privileged_delete_driver_documents"
  on public.driver_documents;

create policy "authenticated_read_driver_documents"
  on public.driver_documents for select to authenticated
  using ((select auth.uid()) is not null);

create policy "privileged_insert_driver_documents"
  on public.driver_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

create policy "privileged_update_driver_documents"
  on public.driver_documents for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

create policy "privileged_delete_driver_documents"
  on public.driver_documents for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

-- Auditoria imutavel de INSERT/UPDATE/DELETE. A tabela nao possui policies de
-- escrita para clientes; somente os triggers SECURITY DEFINER gravam nela.
create table if not exists public.driver_sensitive_audit (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  table_name   text not null check (table_name in ('driver_health', 'driver_documents')),
  row_id       uuid not null,
  action       text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id     uuid,
  actor_role   text,
  old_record   jsonb,
  new_record   jsonb
);

create index if not exists driver_sensitive_audit_row_idx
  on public.driver_sensitive_audit (table_name, row_id, occurred_at desc);

alter table public.driver_sensitive_audit enable row level security;

revoke all on table public.driver_sensitive_audit
  from public, anon, authenticated;
grant select on table public.driver_sensitive_audit
  to authenticated;
grant all on table public.driver_sensitive_audit
  to service_role;

drop policy if exists "privileged_read_driver_sensitive_audit"
  on public.driver_sensitive_audit;
create policy "privileged_read_driver_sensitive_audit"
  on public.driver_sensitive_audit for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

create or replace function public.audit_driver_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.driver_sensitive_audit (
    table_name,
    row_id,
    action,
    actor_id,
    actor_role,
    old_record,
    new_record
  ) values (
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    auth.uid(),
    coalesce(
      (
        select p.role
        from public.profiles p
        where p.id = auth.uid()
      ),
      auth.role()
    ),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  -- O retorno de um AFTER trigger e ignorado pelo PostgreSQL.
  return null;
end;
$$;

revoke all on function public.audit_driver_sensitive_change()
  from public, anon, authenticated;

drop trigger if exists audit_driver_health_changes
  on public.driver_health;
create trigger audit_driver_health_changes
after insert or update or delete on public.driver_health
for each row execute function public.audit_driver_sensitive_change();

drop trigger if exists audit_driver_documents_changes
  on public.driver_documents;
create trigger audit_driver_documents_changes
after insert or update or delete on public.driver_documents
for each row execute function public.audit_driver_sensitive_change();

-- O bucket permanece privado e legivel por usuarios autenticados. Upload,
-- substituicao e remocao de arquivos clinicos exigem lider/admin.
drop policy if exists "driver_documents_authenticated_read"
  on storage.objects;
drop policy if exists "driver_documents_authenticated_insert"
  on storage.objects;
drop policy if exists "driver_documents_authenticated_update"
  on storage.objects;
drop policy if exists "driver_documents_authenticated_delete"
  on storage.objects;
drop policy if exists "driver_documents_privileged_insert"
  on storage.objects;
drop policy if exists "driver_documents_privileged_update"
  on storage.objects;
drop policy if exists "driver_documents_privileged_delete"
  on storage.objects;

create policy "driver_documents_authenticated_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'driver-documents'
    and (select auth.uid()) is not null
  );

create policy "driver_documents_privileged_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'driver-documents'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

create policy "driver_documents_privileged_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'driver-documents'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  )
  with check (
    bucket_id = 'driver-documents'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

create policy "driver_documents_privileged_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'driver-documents'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

comment on table public.driver_sensitive_audit is
  'Trilha imutavel de alteracoes nos prontuarios e metadados documentais de motoristas.';

-- Baseline versionada das automacoes.
--
-- O arquivo legado migration_automations.sql nao faz parte da sequencia de
-- migrations do Supabase. Esta baseline fica antes da primeira migration que
-- insere em public.automations e pode ser aplicada com seguranca em bancos que
-- ja possuem as tabelas.

create table if not exists public.automations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  icon        text not null default 'ti-robot',
  description text,
  active      boolean not null default true,
  endpoint    text not null,
  trigger     text not null check (trigger in ('manual', 'agendado', 'evento')),
  schedule    text,
  event_type  text,
  token       text,
  position    integer not null default 0
);

create table if not exists public.automation_logs (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  automation_id  uuid not null references public.automations(id) on delete cascade,
  status         text not null check (status in ('success', 'failure', 'running')),
  duration       text,
  detail         text,
  logs           jsonb not null default '[]'::jsonb
);

alter table public.automations enable row level security;
alter table public.automation_logs enable row level security;

-- Em um banco novo, as policies abaixo mantem o contrato legado ate a
-- migration do scheduler substitui-las pelas policies de lider/admin. Em um
-- banco existente, nao cria uma policy permissiva ao lado da policy endurecida.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'automations'
      and policyname in ('authenticated_all_automations', 'leaders_manage_automations')
  ) then
    create policy "authenticated_all_automations" on public.automations
      for all to authenticated
      using ((select auth.uid()) is not null)
      with check ((select auth.uid()) is not null);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'automation_logs'
      and policyname in ('authenticated_all_automation_logs', 'leaders_manage_automation_logs')
  ) then
    create policy "authenticated_all_automation_logs" on public.automation_logs
      for all to authenticated
      using ((select auth.uid()) is not null)
      with check ((select auth.uid()) is not null);
  end if;
end
$$;

create index if not exists automation_logs_automation_id_idx
  on public.automation_logs (automation_id);

create index if not exists automation_logs_created_at_idx
  on public.automation_logs (created_at desc);
